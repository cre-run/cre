#!/usr/bin/env node
// 公開リポジトリ（cre-run/cre）に非公開の内容が混ざっていないかを、機械的に判定できる印だけで検査する。
//
// 検出するもの（機械的に判定できる印だけ。顧客名などの文脈依存の判断は push 前の AI レビュー scripts/review-push.mjs が行う）:
//   - 非公開リポジトリの Markdown に付く機密の印（HTML コメントの CONFIDENTIAL マーカー）
//   - 非公開リポジトリへの参照（組織名付きのリポジトリ名）
//   - 非公開パッケージのスコープ（@cre-internal の配下）
//   - `visibility: private` の frontmatter
//
// 使い方（終了コード: 0 = 問題なし、1 = 検出、2 = Claude Code の hook で拒否）:
//   --tool-input      Claude Code（Write / Edit / MultiEdit）と Codex（apply_patch）の PreToolUse hook。
//                     標準入力の JSON から書き込み内容を検査
//   --if-git-command  Claude Code と Codex の PreToolUse hook（Bash）。コマンドが git commit なら staged の差分とコマンド文字列を検査し、
//                     git の hook を迂回するコマンド（--no-verify、core.hooksPath、push の人の確認を名乗る環境変数）は拒否する
//   --staged          git の pre-commit。staged の差分（追加行）を検査
//   --message <file>  git の commit-msg。コミットメッセージを検査
//   --ci              追跡中の全ファイル（未追跡も含む）を検査。GitHub の注釈形式で出す
//   --stdin-text      標準入力の生テキストを検査（テスト用）
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// 自分自身が検出されないよう、文字列を分けて組み立てる
const PRIVATE_REPO = "cre-run/" + "cre-private";
const INTERNAL_SCOPE = "@cre-internal" + "/";
const MARKER_WORD = "CONFI" + "DENTIAL";

export const BUILTIN_PATTERNS = [
  { name: "機密の印", regex: new RegExp(`<!--\\s*${MARKER_WORD}`, "i") },
  { name: "機密の印", regex: new RegExp(`${MARKER_WORD}:\\s*cre-run`, "i") },
  { name: "非公開リポジトリへの参照", regex: new RegExp(escapeRegExp(PRIVATE_REPO), "i") },
  { name: "非公開パッケージのスコープ", regex: new RegExp(escapeRegExp(INTERNAL_SCOPE), "i") },
  { name: "visibility: private", regex: /^\s*visibility:\s*private\b/im },
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

/** テキストを 1 行ずつ検査し、検出した行を返す */
export function scanText(text, patterns, label) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      if (p.regex.test(lines[i])) {
        hits.push({ label, line: i + 1, name: p.name, excerpt: lines[i].trim().slice(0, 120) });
        break;
      }
    }
  }
  return hits;
}

function isProbablyBinary(buf) {
  const head = buf.subarray(0, 8000);
  return head.includes(0);
}

/** BOM 付きの UTF-16 はテキストとして読む（NUL を含むのでバイナリと誤認しない）。それ以外は UTF-8 として返す */
function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe)
    return buf.subarray(2).toString("utf16le");
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return isProbablyBinary(buf) ? null : buf.toString("utf8");
}

function scanTrackedFiles(root, patterns) {
  const out = execFileSync("git", [
    "-C",
    root,
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  const files = out.toString("utf8").split("\0").filter(Boolean);
  const hits = [];
  for (const rel of files) {
    // ファイル名も検査する（顧客名を付けたメモなど）
    hits.push(
      ...scanText(rel, patterns, rel).map((h) => ({ ...h, name: `ファイル名に${h.name}` })),
    );
    const abs = path.join(root, rel);
    let stat;
    try {
      stat = lstatSync(abs); // existsSync はリンク先を辿るので、リンク先が無い symlink を見落とす
    } catch {
      continue; // index にあるが作業ツリーに無い（削除済み）
    }
    if (stat.isSymbolicLink()) {
      // リンク先は辿らず、Git に格納されるリンク先の文字列だけを検査する（.agents/skills など）
      hits.push(
        ...scanText(readlinkSync(abs), patterns, rel).map((h) => ({
          ...h,
          name: `リンク先に${h.name}`,
        })),
      );
      continue;
    }
    if (!stat.isFile()) continue; // サブモジュールなどは飛ばす
    const text = decodeText(readFileSync(abs));
    if (text === null) continue; // 拡張子ではなく実データでバイナリと判定する（名前を変えただけでは逃れられない）
    hits.push(...scanText(text, patterns, rel));
  }
  return hits;
}

/** staged の差分のうち追加行だけを、ファイルごとにまとめて検査する */
/**
 * unified diff の追加行を検査する。ヘッダー（--- / +++）は "diff --git" から最初の "@@" までの間にしか現れないので、
 * その区間だけをヘッダーとして扱い、hunk の中では "+" で始まる行をすべて追加行とみなす（"++ b/..." のような内容も拾う）
 */
function scanPatch(patch, patterns, labelFor) {
  const hits = [];
  let file = "(patch)";
  let inHeader = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      continue;
    }
    if (inHeader) {
      if (line.startsWith("+++ b/")) file = line.slice(6);
      else if (line.startsWith("+++ ")) file = "(deleted)";
      if (line.startsWith("@@")) inHeader = false;
      continue;
    }
    if (line.startsWith("+")) hits.push(...scanText(line.slice(1), patterns, labelFor(file)));
  }
  return hits;
}

function scanStagedDiff(root, patterns) {
  const diff = execFileSync(
    "git",
    [
      "-C",
      root,
      "-c",
      "core.quotePath=false",
      "diff",
      "--cached",
      "--unified=0",
      "--no-color",
      "--text",
      "--no-ext-diff",
    ],
    {
      encoding: "utf8",
    },
  );
  const hits = [];
  // パスは --name-only から取る。内容を変えない rename は patch に "+++ b/" 行が出ないため、diff 本文からでは新しい名前を拾えない
  const names = execFileSync("git", [
    "-C",
    root,
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--diff-filter=ACMRT",
  ]);
  for (const rel of names.toString("utf8").split("\0").filter(Boolean)) {
    hits.push(
      ...scanText(rel, patterns, rel).map((h) => ({ ...h, name: `ファイル名に${h.name}` })),
    );
  }
  hits.push(...scanPatch(diff, patterns, (file) => file));
  return hits;
}

/**
 * git log のリビジョン指定（"a..b" や "--no-walk <sha>..." など）で選んだ各コミットの追加行とパスを検査する。
 * 読めないときは null を返す
 */
export function scanCommits(root, revisions, patterns) {
  let patch;
  let names;
  try {
    // -m で merge commit も各親との差分を出す。--unified=0 で追加行だけを見る。
    // --text と --no-ext-diff で、.gitattributes の -diff や外部 diff ドライバに左右されずテキストとして出す
    patch = execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "core.quotePath=false", // 非 ASCII のパスを "\347..." にクォートしない（パターンと照合するため）
        "log",
        "-p",
        "-m",
        "--unified=0",
        "--no-color",
        "--text",
        "--no-ext-diff",
        "--format=commit %H",
        ...revisions,
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
    // -z で NUL 区切りの生のパスを取る（既定の出力は非 ASCII をクォートし、パターンに一致しなくなる）
    names = execFileSync(
      "git",
      [
        "-C",
        root,
        "log",
        "-m",
        "-z",
        "--name-only",
        "--diff-filter=ACMRT",
        "--format=",
        ...revisions,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return null;
  }
  const hits = [];
  for (const rel of new Set(
    names
      .split(/[\0\n]/)
      .map((l) => l.trim())
      .filter(Boolean),
  )) {
    hits.push(
      ...scanText(rel, patterns, rel).map((h) => ({ ...h, name: `ファイル名に${h.name}（履歴）` })),
    );
  }
  let sha = "";
  for (const chunk of patch.split(/^commit ([0-9a-f]{40})$/m)) {
    if (/^[0-9a-f]{40}$/.test(chunk)) {
      sha = chunk.slice(0, 8);
      continue;
    }
    hits.push(
      ...scanPatch(chunk, patterns, (file) => file).map((h) => ({
        ...h,
        name: `${h.name}（コミット ${sha} で追加）`,
      })),
    );
  }
  return hits;
}

/** リビジョン指定で選んだコミットのメッセージを 1 つのテキストにする。読めないときは null */
export function readCommitMessages(root, revisions) {
  try {
    return execFileSync("git", ["-C", root, "log", "--format=%H%n%B%n----", ...revisions], {
      encoding: "utf8",
    });
  } catch {
    return null;
  }
}

/**
 * AI（Claude Code）が git の hook を迂回しようとするコマンドを見つける。
 * push 前の AI レビューで「人の確認」を求められたとき、その確認を名乗る環境変数を AI 自身が付けてはいけない
 */
export function bypassReason(command) {
  // CRE_PUSH_*（確認済みの宣言、レビュアーの無効化・差し替え、モデルの変更）は、export で先に設定する形も含めて人だけが触る
  if (/\bCRE_PUSH_\w*/.test(command))
    return "push 前の AI レビューの環境変数 CRE_PUSH_*（確認済み・無効化・レビュアーやモデルの差し替え）は人だけが設定する";
  if (!/\bgit\b/.test(command)) return null;
  if (/--no-verify\b/.test(command)) return "git の hook を --no-verify で飛ばすのは人だけ";
  if (/\bcore\.hookspath\b/i.test(command)) return "core.hooksPath の変更は人だけ"; // Git の設定名は大文字小文字を区別しない
  return null;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Claude Code / Codex の PreToolUse hook の JSON から、書き込まれる内容を取り出す。
 * Claude Code の Write / Edit / MultiEdit は content / new_string / edits、
 * Codex の apply_patch は tool_input.command に patch 全体が入る（追加行とパスだけを見る）
 */
function textFromToolInput(json) {
  const input = json?.tool_input ?? {};
  const parts = [];
  if (typeof input.content === "string") parts.push(input.content);
  if (typeof input.new_string === "string") parts.push(input.new_string);
  if (Array.isArray(input.edits))
    for (const e of input.edits) if (typeof e?.new_string === "string") parts.push(e.new_string);
  if (typeof input.file_path === "string") parts.push(input.file_path);
  if (typeof input.command === "string" && /^\*\*\* Begin Patch/m.test(input.command)) {
    for (const line of input.command.split("\n")) {
      // "*** Add File: path" / "*** Update File: path" / "*** Move to: path" と、"+" で始まる追加行
      if (/^\*\*\* (Add File|Update File|Move to): /.test(line))
        parts.push(line.replace(/^\*\*\* [^:]+: /, ""));
      else if (line.startsWith("+") && !line.startsWith("*** ")) parts.push(line.slice(1));
    }
  }
  return {
    text: parts.join("\n"),
    label: typeof input.file_path === "string" ? input.file_path : "(tool input)",
  };
}

export function report(hits, { annotate, patterns = [] }) {
  for (const h of hits) {
    // CI のログは public リポジトリでは誰でも読めるので、検出した行の内容は出さず、場所と種類だけにする。
    // ローカル（hooks・pre-commit）は本人の端末なので内容を見せて直しやすくする
    if (annotate) {
      // ファイル名（ラベル）自体にパターンが一致するときは、種類にかかわらず場所も伏せる（出すとそれ自体が漏れる）
      const labelSensitive = patterns.some((p) => p.regex.test(h.label));
      if (h.name.startsWith("ファイル名に") || labelSensitive) {
        console.log(
          `::error::公開リポジトリに書けない内容です（${h.name}。場所はファイル名自体に含まれるため伏せます。ローカルで node scripts/check-confidential.mjs --ci を実行すると表示されます）`,
        );
      } else {
        console.log(
          `::error file=${h.label},line=${h.line}::公開リポジトリに書けない内容です（${h.name}）`,
        );
      }
    } else
      console.error(
        `${h.label}:${h.line}: 公開リポジトリに書けない内容です（${h.name}: ${h.excerpt}）`,
      );
  }
  if (hits.length > 0) {
    const where = annotate ? console.log : console.error;
    where(
      `検出 ${hits.length} 件。非公開リポジトリの内容・機密の印・非公開パッケージは public の cre に書けません。迷ったら書かずに人に確認してください。`,
    );
  }
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const root = repoRoot();
  const patterns = BUILTIN_PATTERNS;

  switch (mode) {
    case "--tool-input": {
      const json = JSON.parse(readStdin() || "{}");
      const { text, label } = textFromToolInput(json);
      const hits = scanText(text, patterns, label);
      report(hits, { annotate: false });
      process.exit(hits.length ? 2 : 0);
    }
    // falls through（process.exit で抜ける）
    case "--if-git-command": {
      const json = JSON.parse(readStdin() || "{}");
      const command = String(json?.tool_input?.command ?? "");
      const hits = [];
      if (/\bgit\b[^\n;&|]*\bcommit\b/.test(command)) {
        hits.push(
          ...scanText(command, patterns, "(git commit コマンド)"),
          ...scanStagedDiff(root, patterns),
        );
      }
      const bypass = bypassReason(command);
      if (bypass) hits.push({ label: "(git コマンド)", line: 1, name: bypass, excerpt: "" });
      report(hits, { annotate: false });
      process.exit(hits.length ? 2 : 0);
    }
    // falls through
    case "--staged": {
      const hits = scanStagedDiff(root, patterns);
      report(hits, { annotate: false });
      process.exit(hits.length ? 1 : 0);
    }
    // falls through
    case "--message": {
      const file = args[1];
      if (!file) {
        console.error("--message にはコミットメッセージのファイルを渡してください");
        process.exit(2);
      }
      const hits = scanText(readFileSync(file, "utf8"), patterns, "(コミットメッセージ)");
      report(hits, { annotate: false });
      process.exit(hits.length ? 1 : 0);
    }
    // falls through
    case "--ci": {
      const hits = scanTrackedFiles(root, patterns);
      report(hits, { annotate: true, patterns });
      if (hits.length === 0) console.log(`機密の検査: 問題なし（${patterns.length} パターン）`);
      process.exit(hits.length ? 1 : 0);
    }
    // falls through
    case "--stdin-text": {
      const hits = scanText(readStdin(), patterns, "(stdin)");
      report(hits, { annotate: false });
      process.exit(hits.length ? 1 : 0);
    }
    // falls through
    default:
      console.error(
        "使い方: check-confidential.mjs --tool-input | --if-git-command | --staged | --message <file> | --ci | --stdin-text",
      );
      process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
