#!/usr/bin/env node
// 公開リポジトリ（cre-run/cre）に非公開の内容が混ざっていないかを検査する。
//
// 検出するもの:
//   - 非公開リポジトリの Markdown に付く機密の印（HTML コメントの CONFIDENTIAL マーカー）
//   - 非公開リポジトリへの参照（組織名付きのリポジトリ名）
//   - 非公開パッケージのスコープ（@cre-internal の配下）
//   - `visibility: private` の frontmatter
//   - 禁止語（顧客名・内部ホスト名など）。平文で公開リポジトリに置けないので、
//     ローカルは gitignore 済みの `.confidential-terms.local` か環境変数 CONFIDENTIAL_TERMS_FILE が指すファイル
//     （非公開リポジトリの checkout 内の正本など）、CI は環境変数 CONFIDENTIAL_TERMS から読む
//
// 使い方（終了コード: 0 = 問題なし、1 = 検出、2 = Claude Code の hook で拒否）:
//   --tool-input      Claude Code の PreToolUse hook（Write / Edit / MultiEdit）。標準入力の JSON から書き込み内容を検査
//   --if-git-commit   Claude Code の PreToolUse hook（Bash）。コマンドが git commit なら staged の差分とコマンド文字列を検査
//   --staged          git の pre-commit。staged の差分（追加行）を検査
//   --message <file>  git の commit-msg。コミットメッセージを検査
//   --ci              追跡中の全ファイルと、環境変数 CONFIDENTIAL_EXTRA_TEXT（PR の題名・本文）、
//                     CONFIDENTIAL_COMMIT_RANGE（コミットメッセージの範囲）を検査。
//                     CONFIDENTIAL_REQUIRE_TERMS=true のとき、CONFIDENTIAL_TERMS が未設定なら失敗する（fail closed）。
//                     禁止語が無いなら `# none` のようなコメント 1 行を Secret に登録する
//   --stdin-text      標準入力の生テキストを検査（テスト用）
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// 自分自身が検出されないよう、文字列を分けて組み立てる
const PRIVATE_REPO = "cre-run/" + "cre-private";
const INTERNAL_SCOPE = "@cre-internal" + "/";
const MARKER_WORD = "CONFI" + "DENTIAL";

const BUILTIN_PATTERNS = [
  { name: "機密の印", regex: new RegExp(`<!--\\s*${MARKER_WORD}`, "i") },
  { name: "機密の印", regex: new RegExp(`${MARKER_WORD}:\\s*cre-run`, "i") },
  { name: "非公開リポジトリへの参照", regex: new RegExp(escapeRegExp(PRIVATE_REPO), "i") },
  { name: "非公開パッケージのスコープ", regex: new RegExp(escapeRegExp(INTERNAL_SCOPE), "i") },
  { name: "visibility: private", regex: /^\s*visibility:\s*private\b/im },
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

/** 禁止語を読む。ローカルファイルと環境変数の両方。空行と # で始まる行は無視 */
function loadTerms(root) {
  const sources = [];
  const localFile = path.join(root, ".confidential-terms.local");
  if (existsSync(localFile)) sources.push(readFileSync(localFile, "utf8"));
  // 正本を別の場所（非公開リポジトリの checkout など）に置いているときは、環境変数でそのパスを指す。コピーして同期する必要がない
  const file = process.env.CONFIDENTIAL_TERMS_FILE;
  if (file) {
    if (!existsSync(file)) {
      // 明示的に指された正本が読めないのに禁止語 0 件で通すと、ローカルの防御が消えたことに気付けない
      console.error(`CONFIDENTIAL_TERMS_FILE が指すファイルがありません: ${file}`);
      process.exit(2);
    }
    sources.push(readFileSync(file, "utf8"));
  }
  if (process.env.CONFIDENTIAL_TERMS) sources.push(process.env.CONFIDENTIAL_TERMS);
  const terms = new Set();
  for (const src of sources) {
    for (const raw of src.split(/\r?\n/)) {
      const t = raw.trim();
      if (t && !t.startsWith("#")) terms.add(t);
    }
  }
  return [...terms].map((t) => ({ name: "禁止語", regex: new RegExp(escapeRegExp(t), "i") }));
}

/** テキストを 1 行ずつ検査し、検出した行を返す */
function scanText(text, patterns, label) {
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
    const buf = readFileSync(abs);
    if (isProbablyBinary(buf)) continue; // 拡張子ではなく実データで判定する（名前を変えただけでは逃れられない）
    hits.push(...scanText(buf.toString("utf8"), patterns, rel));
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
    ["-C", root, "diff", "--cached", "--unified=0", "--no-color", "--text", "--no-ext-diff"],
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
 * 範囲内の各コミットが追加した行とパスを検査する。最終的な作業ツリーからは消えていても、
 * 中間コミットで追加された内容は公開された履歴から取り出せるため
 */
function scanRangeCommits(root, range, patterns) {
  // before が全ゼロ（ブランチの初回 push）のときは、head から到達できる全履歴を検査する
  const m = /^0{40}\.\.(.+)$/.exec(range);
  const target = m ? [m[1]] : [range];
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
        "log",
        "-p",
        "-m",
        "--unified=0",
        "--no-color",
        "--text",
        "--no-ext-diff",
        "--format=commit %H",
        ...target,
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
    names = execFileSync(
      "git",
      ["-C", root, "log", "-m", "--name-only", "--diff-filter=ACMRT", "--format=", ...target],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    console.log(
      `::error::コミット範囲 ${range} の差分を読めません。force-push などで before が失われた可能性があります。検査できないので失敗にします`,
    );
    process.exit(1);
  }
  const hits = [];
  for (const rel of new Set(
    names
      .split("\n")
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

function scanCommitMessages(root, range, patterns) {
  // 初回の push は before が全ゼロなので、HEAD のメッセージだけを検査する
  // before が全ゼロ（ブランチの初回 push）のときは、head から到達できる全履歴のメッセージを検査する
  const m = /^0{40}\.\.(.+)$/.exec(range);
  const args = ["log", "--format=%H%n%B%n----", m ? m[1] : range];
  try {
    const log = execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
    return scanText(log, patterns, "コミットメッセージ " + range);
  } catch {
    // 範囲が読めない（force-push で before が到達不能になった、など）ときは、検査できないまま成功にしない
    console.log(
      `::error::コミットメッセージの範囲 ${range} を読めません。force-push などで before が失われた可能性があります。検査できないので失敗にします`,
    );
    process.exit(1);
  }
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Claude Code の hook の JSON から、書き込まれる内容を取り出す */
function textFromToolInput(json) {
  const input = json?.tool_input ?? {};
  const parts = [];
  if (typeof input.content === "string") parts.push(input.content);
  if (typeof input.new_string === "string") parts.push(input.new_string);
  if (Array.isArray(input.edits))
    for (const e of input.edits) if (typeof e?.new_string === "string") parts.push(e.new_string);
  if (typeof input.file_path === "string") parts.push(input.file_path);
  return {
    text: parts.join("\n"),
    label: typeof input.file_path === "string" ? input.file_path : "(tool input)",
  };
}

function report(hits, { annotate, patterns = [] }) {
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
      `検出 ${hits.length} 件。顧客名・非公開リポジトリの内容・機密の印・非公開パッケージは public の cre に書けません。迷ったら書かずに人に確認してください。`,
    );
  }
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const root = repoRoot();
  const patterns = [...BUILTIN_PATTERNS, ...loadTerms(root)];

  switch (mode) {
    case "--tool-input": {
      const json = JSON.parse(readStdin() || "{}");
      const { text, label } = textFromToolInput(json);
      const hits = scanText(text, patterns, label);
      report(hits, { annotate: false });
      process.exit(hits.length ? 2 : 0);
    }
    // falls through（process.exit で抜ける）
    case "--if-git-commit": {
      const json = JSON.parse(readStdin() || "{}");
      const command = String(json?.tool_input?.command ?? "");
      if (!/\bgit\b[^\n;&|]*\bcommit\b/.test(command)) process.exit(0);
      const hits = [
        ...scanText(command, patterns, "(git commit コマンド)"),
        ...scanStagedDiff(root, patterns),
      ];
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
      const termsConfigured = (process.env.CONFIDENTIAL_TERMS ?? "").trim().length > 0;
      if (!termsConfigured) {
        if (process.env.CONFIDENTIAL_REQUIRE_TERMS === "true") {
          console.log(
            "::error::Secret CONFIDENTIAL_TERMS が未設定です。禁止語を 1 行 1 語で登録してください（無いなら `# none` のようなコメント 1 行）。未設定のまま成功にはしません",
          );
          process.exit(1);
        }
        console.log(
          "::warning::CONFIDENTIAL_TERMS が渡されていないので、禁止語の検査は飛ばします（フォークや Dependabot の実行では Secret が渡りません）",
        );
      }
      const hits = scanTrackedFiles(root, patterns);
      if (process.env.CONFIDENTIAL_EXTRA_TEXT)
        hits.push(...scanText(process.env.CONFIDENTIAL_EXTRA_TEXT, patterns, "(PR の題名・本文)"));
      if (process.env.CONFIDENTIAL_COMMIT_RANGE) {
        hits.push(...scanCommitMessages(root, process.env.CONFIDENTIAL_COMMIT_RANGE, patterns));
        hits.push(...scanRangeCommits(root, process.env.CONFIDENTIAL_COMMIT_RANGE, patterns));
      }
      report(hits, { annotate: true, patterns });
      if (hits.length === 0)
        console.log(
          `機密の検査: 問題なし（禁止語 ${patterns.length - BUILTIN_PATTERNS.length} 件を含む ${patterns.length} パターン）`,
        );
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
        "使い方: check-confidential.mjs --tool-input | --if-git-commit | --staged | --message <file> | --ci | --stdin-text",
      );
      process.exit(2);
  }
}

main();
