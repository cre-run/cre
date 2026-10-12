#!/usr/bin/env node
// push 前のレビュー（git の pre-push hook から呼ばれる）。
//
// これから push するコミットについて、
//   1. 機械的に判定できる印（scripts/check-confidential.mjs の組み込みパターン）を検査し、あれば止める
//   2. 高速で安価なモデル（既定は Claude Haiku）に差分とコミットメッセージを読ませ、
//      公開リポジトリに出すべきでない内容（顧客名・商談・価格・採用・内部構成など）がないかを判断させる
// モデルが「要確認」と答えたら、理由を表示して人に確認を求める。端末があれば y/N を聞き、
// 端末がなければ（AI エージェントの実行など）push を止める。
//
// 人が内容を確かめて push すると決めたら、人が次のどちらかを行う（AI は行わない。Claude Code の hook が止める）:
//   - 端末で y と答える
//   - CRE_PUSH_REVIEWED=1 git push ...
//
// 環境変数:
//   CRE_PUSH_REVIEWER        claude（既定。claude CLI）| codex（codex CLI）| off（AI レビューを飛ばす。人だけが使う）
//   CRE_PUSH_REVIEW_MODEL    モデル名。claude の既定は claude-haiku-5-5、codex は CLI の既定
//   CRE_PUSH_REVIEW_COMMAND  自前のレビュアー（sh -c で実行。標準入力に依頼文、標準出力に JSON）。テストや別モデル用
//   CRE_PUSH_REVIEWED        1 なら AI レビューを飛ばし、人が確認済みとして push する
//
// 使い方: review-push.mjs <remote> <url>  （標準入力は pre-push の "<local ref> <local sha> <remote ref> <remote sha>" 行）
import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import {
  BUILTIN_PATTERNS,
  readCommitMessages,
  repoRoot,
  report,
  scanCommits,
  scanText,
} from "./check-confidential.mjs";

const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";
/** モデルに渡す上限（文字）。超えた分は省略し、人の確認を求める */
const MAX_CHARS = 150_000;
/** lockfile は量が多いので、機密が入り得る行（registry や tarball の URL）だけを読ませる */
const LOCKFILES = [/(^|\/)pnpm-lock\.yaml$/, /(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/];
const LOCKFILE_KEEP = /:\/\//;
const REVIEW_TIMEOUT_MS = 180_000;

const SYSTEM_PROMPT = `あなたは、ソロの小さな会社が公開している GitHub リポジトリ cre-run/cre（製品 CRE / cre.run のコードとドキュメント）への push を、公開前に審査するレビュアーです。
これから push されるコミットのメッセージと追加行を読み、公開してはいけない内容が含まれていないかを判断してください。

公開してはいけない内容（見つけたら必ず指摘する）:
- 顧客・見込み顧客・取引先の名前や、それを推測できる情報。商談・契約・売上・価格の検討
- 採用計画、資金、競合分析の結論などの経営情報
- 内部のホスト名・アカウント ID・トークン・鍵・メールアドレス・個人情報
- 非公開リポジトリ（cre-private）や内部資料の内容の引用・要約。機密の印（CONFIDENTIAL）
- 管理用の経路（内部 API、管理画面の URL、運用手順の詳細）

指摘しなくてよいもの:
- 製品名 CRE / cre.run、公開済みの URL（docs.cre.run、editor.cre.run）、OSS のパッケージ名
- example.com などの見本、テストの架空データ、コードの識別子、一般的な技術の説明

迷ったら指摘してください（人が最終判断します）。ただし理由は具体的に書いてください。
出力は次の JSON だけにし、前後に説明や Markdown を付けないでください。
{"risk":"none" | "review","findings":[{"where":"ファイルパスまたはコミット","what":"該当箇所の短い引用か説明","why":"公開してはいけない理由"}]}
risk は、指摘が 1 件でもあれば "review"、なければ "none" にします。理由は日本語で書きます。`;

/** codex exec の --output-schema に渡す、最終メッセージの JSON Schema */
const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    risk: { type: "string", enum: ["none", "review"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          where: { type: "string" },
          what: { type: "string" },
          why: { type: "string" },
        },
        required: ["where", "what", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["risk", "findings"],
  additionalProperties: false,
};

const ZERO = "0".repeat(40);

function git(root, args, options = {}) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}

/**
 * pre-push の標準入力から、これから push するコミットと、タグ（名前と注釈付きタグのメッセージ）を集める。
 * タグは既に push 済みのコミットを指していてもメッセージが公開されるので、コミットが無くても検査する
 */
function refsToPush(root, remote, stdin) {
  const shas = new Set();
  const tags = [];
  for (const line of stdin.split("\n")) {
    const [localRef, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || localSha === ZERO) continue; // ブランチ・タグの削除
    if (localRef.startsWith("refs/tags/")) {
      const name = localRef.slice("refs/tags/".length);
      const type = git(root, ["cat-file", "-t", localSha]).trim();
      // 注釈付きタグはメッセージを持つ。軽量タグは名前だけ
      const message = type === "tag" ? git(root, ["tag", "-l", "--format=%(contents)", name]) : "";
      tags.push({ name, message });
    }
    // リモートにまだ無い ref なら、送信先リモートの追跡ブランチのどれにも無いコミットが対象。
    // 他のリモート（非公開のミラーなど）にあるかどうかは関係ない（--remotes 全体で除外すると検査が抜ける）
    const revs =
      !remoteSha || remoteSha === ZERO
        ? [localSha, "--not", `--remotes=${remote}`]
        : [`${remoteSha}..${localSha}`];
    for (const sha of git(root, ["rev-list", "--reverse", ...revs]).split("\n")) {
      if (sha) shas.add(sha);
    }
  }
  return { shas: [...shas], tags };
}

/** タグの名前とメッセージを 1 つのテキストにする */
function tagsText(tags) {
  return tags.map((t) => `タグ ${t.name}\n${t.message}`).join("\n----\n");
}

/** モデルに読ませる本文: コミットメッセージ、追加・変更・改名されたパス、各コミットの追加行（削除行は除く） */
function buildReviewText(root, shas, tags) {
  const revisions = ["--no-walk", ...shas];
  const messages = shas.length > 0 ? (readCommitMessages(root, revisions) ?? "") : "";
  // パスは --name-only から取る。内容を変えない rename は patch に "+++ b/" 行が出ず、新しい名前が本文に現れない
  const paths = [
    ...new Set(
      git(root, [
        "log",
        "-m",
        "-z",
        "--name-only",
        "--diff-filter=ACMRT",
        "--format=",
        ...revisions,
      ])
        .split(/[\0\n]/)
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ];
  const patch =
    shas.length > 0
      ? git(root, [
          "-c",
          "core.quotePath=false",
          "log",
          "-p",
          "-m",
          "--no-walk",
          "--unified=0",
          "--no-color",
          "--text",
          "--no-ext-diff",
          "--format=commit %H",
          ...shas,
        ])
      : "";
  const out = [];
  let skipping = false;
  let lockfile = false;
  let inHeader = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("commit ")) {
      out.push(`\n## コミット ${line.slice(7, 15)}`);
      continue;
    }
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      skipping = false;
      continue;
    }
    if (inHeader) {
      if (line.startsWith("+++ b/")) {
        const file = line.slice(6);
        lockfile = LOCKFILES.some((re) => re.test(file));
        out.push(`\n### ${file}${lockfile ? "（URL を含む行だけ）" : ""}`);
      } else if (line.startsWith("+++ ")) {
        skipping = true; // 削除されたファイル（追加行は無い）
      }
      if (line.startsWith("@@")) inHeader = false;
      continue;
    }
    if (skipping || !line.startsWith("+")) continue;
    if (!lockfile || LOCKFILE_KEEP.test(line)) out.push(line);
  }
  const tagSection = tags.length > 0 ? `# タグ（名前とメッセージ）\n\n${tagsText(tags)}\n\n` : "";
  const text = `${tagSection}# コミットメッセージ\n\n${messages}\n# 追加・変更・改名されたファイルのパス\n\n${paths.join("\n")}\n\n# 追加行\n${out.join("\n")}\n`;
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_CHARS)}\n\n（以降 ${text.length - MAX_CHARS} 文字は省略）\n`,
    truncated: true,
  };
}

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  return r.status === 0;
}

/** モデルを呼び、出力の文字列を返す */
function askReviewer(prompt) {
  const custom = process.env.CRE_PUSH_REVIEW_COMMAND;
  const reviewer =
    process.env.CRE_PUSH_REVIEWER || (which("claude") ? "claude" : which("codex") ? "codex" : "");
  const model = process.env.CRE_PUSH_REVIEW_MODEL;
  let cmd;
  let args;
  let label;
  let workDir;
  let outputFile;
  if (custom) {
    cmd = "sh";
    args = ["-c", custom];
    label = "自前のレビュアー";
  } else if (reviewer === "claude") {
    cmd = "claude";
    const m = model || DEFAULT_CLAUDE_MODEL;
    // --tools は可変長の引数なので、依頼文より後ろ（最後）に置く
    args = [
      "-p",
      "上の内容を審査し、JSON だけを出力してください。",
      "--model",
      m,
      "--system-prompt",
      SYSTEM_PROMPT,
      "--output-format",
      "text",
      "--no-session-persistence",
      "--tools",
      "",
    ];
    label = `claude ${m}`;
  } else if (reviewer === "codex") {
    // 依頼文は標準入力から読ませ、最終メッセージは -o のファイルから取る（標準出力には進捗も混ざり得る）。
    // --output-schema で JSON の形を強制し、--ephemeral でセッションを残さない
    workDir = mkdtempSync(path.join(tmpdir(), "cre-push-review-"));
    const schemaFile = path.join(workDir, "schema.json");
    outputFile = path.join(workDir, "verdict.json");
    writeFileSync(schemaFile, JSON.stringify(VERDICT_SCHEMA));
    cmd = "codex";
    args = [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--color",
      "never",
      "--output-schema",
      schemaFile,
      "-o",
      outputFile,
      ...(model ? ["-m", model] : []),
    ];
    label = `codex ${model || "(既定のモデル)"}`;
  } else {
    return {
      error:
        "AI レビューに使う CLI が見つかりません。claude か codex を入れるか、CRE_PUSH_REVIEWER / CRE_PUSH_REVIEW_COMMAND で指定してください",
    };
  }
  // claude は標準入力を利用者の発言として読む。codex も標準入力の依頼文を読むので、両方とも system 相当の指示を本文の先頭に置く
  const input = custom || reviewer === "codex" ? `${SYSTEM_PROMPT}\n\n---\n\n${prompt}` : prompt;
  const env = { ...process.env };
  delete env.CLAUDECODE; // Claude Code のセッション内から push しても、入れ子として扱わせない
  try {
    const r = spawnSync(cmd, args, {
      input,
      encoding: "utf8",
      timeout: REVIEW_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env,
    });
    if (r.error || r.status !== 0) {
      return {
        label,
        error: `${label} の実行に失敗しました（${r.error?.message ?? `終了コード ${r.status}`}）\n${(r.stderr || "").trim().slice(-2000)}`,
      };
    }
    let output = r.stdout;
    if (outputFile) {
      try {
        output = readFileSync(outputFile, "utf8");
      } catch {
        // -o のファイルが無ければ標準出力から拾う
      }
    }
    return { label, output };
  } finally {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  }
}

/** 出力から JSON を取り出す（前後に文章や ``` が付いても拾う） */
function parseVerdict(output) {
  const m = /\{[\s\S]*\}/.exec(output);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    if (v.risk !== "none" && v.risk !== "review") return null;
    const findings = Array.isArray(v.findings) ? v.findings : [];
    return { risk: findings.length > 0 ? "review" : v.risk, findings };
  } catch {
    return null;
  }
}

/** 端末で人に y/N を聞く。端末が無ければ null */
function askHuman(question) {
  let fd;
  try {
    fd = openSync("/dev/tty", "r+");
  } catch {
    return null;
  }
  try {
    writeSync(fd, question);
    const buf = Buffer.alloc(64);
    const n = readSync(fd, buf, 0, buf.length, null);
    return /^y(es)?$/i.test(buf.toString("utf8", 0, n).trim());
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

function main() {
  const root = repoRoot();
  const stdin = (() => {
    try {
      return readFileSync(0, "utf8");
    } catch {
      return "";
    }
  })();
  const remote = process.argv[2] || "origin"; // pre-push の第 1 引数（リモート名。URL 指定の push ならその URL）
  const { shas, tags } = refsToPush(root, remote, stdin);
  if (shas.length === 0 && tags.length === 0) process.exit(0);

  // 1. 確定的な印。ここは人の確認でも通さない
  const revisions = ["--no-walk", ...shas];
  const messages = shas.length > 0 ? readCommitMessages(root, revisions) : "";
  const commitHits = shas.length > 0 ? scanCommits(root, revisions, BUILTIN_PATTERNS) : [];
  if (messages === null || commitHits === null) {
    console.error("push するコミットを読めませんでした。push を止めます");
    process.exit(1);
  }
  const hits = [
    ...scanText(messages, BUILTIN_PATTERNS, "(コミットメッセージ)"),
    ...commitHits,
    ...scanText(tagsText(tags), BUILTIN_PATTERNS, "(タグ)"),
  ];
  if (hits.length > 0) {
    report(hits, { annotate: false });
    console.error(
      "push を止めました。該当のコミットやタグを直してください（人の確認でも通しません）",
    );
    process.exit(1);
  }

  // 2. AI レビュー
  if (process.env.CRE_PUSH_REVIEWED === "1") {
    console.error(
      `push 前の AI レビュー: CRE_PUSH_REVIEWED=1 なので人が確認済みとして push します（${shas.length} コミット、${tags.length} タグ）`,
    );
    process.exit(0);
  }
  if (process.env.CRE_PUSH_REVIEWER === "off") {
    console.error("push 前の AI レビュー: CRE_PUSH_REVIEWER=off なので飛ばします");
    process.exit(0);
  }
  const { text, truncated } = buildReviewText(root, shas, tags);
  const r = askReviewer(text);
  if (r.error) {
    console.error(`push 前の AI レビューができませんでした: ${r.error}`);
    console.error(
      "内容を人が確かめたうえで push するなら、人が CRE_PUSH_REVIEWED=1 を付けて git push してください",
    );
    process.exit(1);
  }
  const verdict = parseVerdict(r.output);
  if (!verdict) {
    console.error(`push 前の AI レビュー（${r.label}）の出力を JSON として読めませんでした:`);
    console.error(r.output.trim().slice(0, 2000));
    console.error("もう一度 push するか、人が内容を確かめて CRE_PUSH_REVIEWED=1 を付けてください");
    process.exit(1);
  }
  if (verdict.risk === "none" && !truncated) {
    console.error(
      `push 前の AI レビュー（${r.label}）: 問題なし（${shas.length} コミット${tags.length ? `、${tags.length} タグ` : ""}）`,
    );
    process.exit(0);
  }

  console.error(`push 前の AI レビュー（${r.label}）: 人の確認が必要です`);
  if (truncated)
    console.error(
      `- 差分が大きく、先頭 ${MAX_CHARS} 文字しか読ませていません。残りは人が確かめてください`,
    );
  for (const f of verdict.findings) {
    const where = typeof f?.where === "string" ? f.where : "(場所不明)";
    const what = typeof f?.what === "string" && f.what ? `「${f.what}」` : "";
    const why = typeof f?.why === "string" ? f.why : "";
    console.error(`- ${where}: ${what}${what && why ? " — " : ""}${why}`);
  }
  const answer = askHuman("\n公開リポジトリに push してよいですか？ [y/N] ");
  if (answer === true) {
    console.error("人の確認を得たので push します");
    process.exit(0);
  }
  if (answer === null) {
    console.error(
      "\n端末が無いので人に確認できません。push を止めました。人が上の指摘を確かめ、問題なければ人が端末から git push するか、CRE_PUSH_REVIEWED=1 を付けて push してください（AI エージェントは付けないこと）",
    );
  } else {
    console.error("push を止めました");
  }
  process.exit(1);
}

main();
