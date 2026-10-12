import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./review-push.mjs", import.meta.url));
const privateRepo = "cre-run/" + "cre-private";
const ZERO = "0".repeat(40);

/** 1 コミットだけある一時リポジトリ。その commit は origin/main として push 済みの扱い */
function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-repo-"));
  const git = (...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.com");
  writeFileSync(path.join(dir, "README.md"), "# clean\nold line\n");
  git("add", "-A");
  git("commit", "-q", "-m", "chore: clean");
  const head = () => git("rev-parse", "HEAD").stdout.trim();
  git("update-ref", "refs/remotes/origin/main", head());
  return { dir, git, head };
}

/**
 * 自前のレビュアー: 受け取った依頼文を prompt.txt に書き、決めておいた答えを返す。
 * verdict が無ければ呼ばれてはいけない（呼ばれたら prompt.txt ができる）
 */
function fakeReviewer(_dir, verdict) {
  const work = mkdtempSync(path.join(tmpdir(), "rp-reviewer-")); // 呼び出しごとに別の場所（呼ばれたかどうかを個別に見る）
  const promptFile = path.join(work, "prompt.txt");
  const answerFile = path.join(work, "answer.txt");
  writeFileSync(answerFile, verdict ?? "");
  return {
    command: `cat > "${promptFile}" && cat "${answerFile}"`,
    prompt: () => (existsSync(promptFile) ? readFileSync(promptFile, "utf8") : null),
  };
}

/** pre-push と同じ呼び方: 引数にリモート、標準入力に ref の行。端末は無い */
function push(dir, { stdin, env = {}, command, pathPrefix }) {
  const base = { ...process.env };
  for (const k of Object.keys(base)) if (k.startsWith("CRE_PUSH_")) delete base[k];
  if (pathPrefix) base.PATH = `${pathPrefix}${path.delimiter}${base.PATH ?? ""}`;
  return spawnSync(process.execPath, [script, "origin", "git@example.com:x/y.git"], {
    cwd: dir,
    input: stdin,
    encoding: "utf8",
    env: { ...base, ...env, ...(command ? { CRE_PUSH_REVIEW_COMMAND: command } : {}) },
  });
}

/**
 * claude / codex の CLI の偽物を PATH に置く。受け取った引数と標準入力を記録し、
 * codex なら -o のファイルに、claude なら標準出力に答えを書く
 */
function fakeCli(name, verdict) {
  const bin = mkdtempSync(path.join(tmpdir(), `rp-${name}-`));
  const argsFile = path.join(bin, "args.json");
  const stdinFile = path.join(bin, "stdin.txt");
  const exe = path.join(bin, name);
  writeFileSync(
    exe,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(args));
fs.writeFileSync(${JSON.stringify(stdinFile)}, fs.readFileSync(0, "utf8"));
const o = args.indexOf("-o");
if (o >= 0) fs.writeFileSync(args[o + 1], ${JSON.stringify(verdict)});
else process.stdout.write(${JSON.stringify(verdict)});
`,
  );
  chmodSync(exe, 0o755);
  return {
    bin,
    args: () => JSON.parse(readFileSync(argsFile, "utf8")),
    stdin: () => readFileSync(stdinFile, "utf8"),
  };
}

const newBranchLine = (sha) => `refs/heads/feat ${sha} refs/heads/feat ${ZERO}\n`;

test("レビュアーが問題なしと答えれば push できる", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "a.md"), "# ok\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: add a");
  const fake = fakeReviewer(dir, '{"risk":"none","findings":[]}');
  const r = push(dir, { stdin: newBranchLine(head()), command: fake.command });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /問題なし（1 コミット）/);
});

test("レビュアーが要確認と答え、端末が無ければ push を止めて指摘と人への案内を出す", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "memo.md"), "大口顧客 Zorblax 社との契約は月額 999 万円\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const fake = fakeReviewer(
    dir,
    '```json\n{"risk":"review","findings":[{"where":"memo.md","what":"Zorblax 社 月額 999 万円","why":"顧客名と契約金額"}]}\n```',
  );
  const r = push(dir, { stdin: newBranchLine(head()), command: fake.command });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /人の確認が必要/);
  assert.match(r.stderr, /memo\.md: 「Zorblax 社 月額 999 万円」 — 顧客名と契約金額/);
  assert.match(r.stderr, /CRE_PUSH_REVIEWED=1/);
});

test("レビュアーには追加行とコミットメッセージとパスを渡し、削除行と lockfile の URL 以外の行は渡さない", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "README.md"), "# clean\nnew line\n");
  writeFileSync(
    path.join(dir, "pnpm-lock.yaml"),
    "lockfileVersion: 9\nsecret-looking: value\n  resolution: {tarball: https://npm.internal.example/x.tgz}\n",
  );
  git("add", "-A");
  git("commit", "-q", "-m", "chore: update readme\n\n本文の説明");
  const fake = fakeReviewer(dir, '{"risk":"none","findings":[]}');
  const r = push(dir, { stdin: newBranchLine(head()), command: fake.command });
  assert.equal(r.status, 0, r.stderr);
  const prompt = fake.prompt();
  assert.match(prompt, /chore: update readme/);
  assert.match(prompt, /本文の説明/);
  assert.match(prompt, /### README\.md\n\+new line/);
  assert.doesNotMatch(prompt, /old line/);
  assert.doesNotMatch(prompt, /secret-looking/);
  assert.match(prompt, /npm\.internal\.example/); // lockfile でも URL の行は読ませる
  assert.match(prompt, /公開してはいけない内容/); // 指示も本文の先頭に入る
  assert.match(prompt, /# push する ref（送信先の名前）\n\nrefs\/heads\/feat/);
});

test("内容を変えない rename でも、新しいパスをレビュアーに渡す", () => {
  const { dir, git, head } = makeRepo();
  git("mv", "README.md", "customer-zorblax-memo.md");
  git("commit", "-q", "-m", "docs: rename");
  const fake = fakeReviewer(dir, '{"risk":"none","findings":[]}');
  const r = push(dir, { stdin: newBranchLine(head()), command: fake.command });
  assert.equal(r.status, 0, r.stderr);
  assert.match(fake.prompt(), /customer-zorblax-memo\.md/);
});

test("新規ブランチでは、送信先のリモートに無いコミットを対象にする（他のリモートにあっても除外しない）", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "a.md"), "# first\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: first");
  git("update-ref", "refs/remotes/private/main", head()); // 非公開のミラーには push 済み
  const fake = fakeReviewer(dir, '{"risk":"none","findings":[]}');
  const r = push(dir, { stdin: newBranchLine(head()), command: fake.command });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /1 コミット/);
  assert.match(fake.prompt(), /docs: first/);
});

test('claude CLI は -p で、指示を system prompt に、本文を標準入力に渡し、--tools "" を最後に置く', () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "a.md"), "# ok\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: add a");
  const cli = fakeCli("claude", '{"risk":"none","findings":[]}');
  const r = push(dir, {
    stdin: newBranchLine(head()),
    pathPrefix: cli.bin,
    env: { CRE_PUSH_REVIEWER: "claude" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /claude claude-haiku-5-5/);
  const args = cli.args();
  assert.equal(args[0], "-p");
  assert.deepEqual(args.slice(-2), ["--tools", ""]);
  assert.equal(args[args.indexOf("--model") + 1], "claude-haiku-5-5");
  assert.match(args[args.indexOf("--system-prompt") + 1], /公開してはいけない内容/);
  assert.match(cli.stdin(), /docs: add a/);
});

test("codex CLI は exec で、本文を標準入力に渡し、-o のファイルから答えを読む（モデルは CRE_PUSH_REVIEW_MODEL）", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "a.md"), "# ok\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: add a");
  const cli = fakeCli(
    "codex",
    '{"risk":"review","findings":[{"where":"a.md","what":"x","why":"y"}]}',
  );
  const r = push(dir, {
    stdin: newBranchLine(head()),
    pathPrefix: cli.bin,
    env: { CRE_PUSH_REVIEWER: "codex", CRE_PUSH_REVIEW_MODEL: "gpt-5-mini" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /codex gpt-5-mini/);
  assert.match(r.stderr, /a\.md: 「x」 — y/);
  const args = cli.args();
  assert.equal(args[0], "exec");
  assert.ok(args.includes("--skip-git-repo-check"));
  assert.deepEqual(args.slice(args.indexOf("--sandbox"), args.indexOf("--sandbox") + 2), [
    "--sandbox",
    "read-only",
  ]);
  assert.deepEqual(args.slice(-2), ["-m", "gpt-5-mini"]);
  assert.ok(args.includes("--output-schema"));
  const stdin = cli.stdin();
  assert.match(stdin, /^あなたは、/); // codex には system 相当の指示を本文の先頭に置く
  assert.match(stdin, /docs: add a/);
});

test("push 済みのコミットに付けた注釈付きタグでも、タグのメッセージに印があれば止める", () => {
  const { dir, git, head } = makeRepo();
  git("tag", "-a", "v1.0.0", "-m", `リリース。詳細は ${privateRepo} を見る`);
  const tagSha = git("rev-parse", "refs/tags/v1.0.0").stdout.trim();
  assert.notEqual(tagSha, head());
  const fake = fakeReviewer(dir, null);
  const r = push(dir, {
    stdin: `refs/tags/v1.0.0 ${tagSha} refs/tags/v1.0.0 ${ZERO}\n`,
    command: fake.command,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\(タグ\):/);
  assert.equal(fake.prompt(), null);
});

test("refspec で別名に push するとき、送信先のタグ名・ブランチ名を検査する", () => {
  const { dir, git, head } = makeRepo();
  git("tag", "clean");
  const fake = fakeReviewer(dir, null);
  const tag = push(dir, {
    stdin: `refs/tags/clean ${head()} refs/tags/${privateRepo} ${ZERO}\n`,
    command: fake.command,
  });
  assert.equal(tag.status, 1);
  assert.match(tag.stderr, /\(push 先の ref 名\)/);
  const branch = push(dir, {
    stdin: `refs/heads/main ${head()} refs/heads/${privateRepo} ${ZERO}\n`,
    command: fake.command,
  });
  assert.equal(branch.status, 1);
  assert.match(branch.stderr, /\(push 先の ref 名\)/);
  assert.equal(fake.prompt(), null);
});

test("注釈付きタグの名前とメッセージもレビュアーに渡す（コミットが無くても）", () => {
  const { dir, git } = makeRepo();
  git("tag", "-a", "customer-zorblax", "-m", "Zorblax 社向けの納品版");
  const tagSha = git("rev-parse", "refs/tags/customer-zorblax").stdout.trim();
  const fake = fakeReviewer(dir, '{"risk":"none","findings":[]}');
  const r = push(dir, {
    stdin: `refs/tags/customer-zorblax ${tagSha} refs/tags/customer-zorblax ${ZERO}\n`,
    command: fake.command,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /0 コミット、1 タグ/);
  const prompt = fake.prompt();
  assert.match(prompt, /タグ customer-zorblax\nZorblax 社向けの納品版/);
});

test("一度「要確認」になったコミットは、次の push でモデルに聞き直さず人の確認を求め、人が確認すると忘れる", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "memo.md"), "大口顧客 Zorblax 社との契約\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const stdin = newBranchLine(head());
  const first = fakeReviewer(
    dir,
    '{"risk":"review","findings":[{"where":"memo.md","what":"Zorblax 社","why":"顧客名"}]}',
  );
  assert.equal(push(dir, { stdin, command: first.command }).status, 1);

  // 2 回目: モデルが「問題なし」と答えても通さない（呼ばれもしない）
  const second = fakeReviewer(dir, '{"risk":"none","findings":[]}');
  const r2 = push(dir, { stdin, command: second.command });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /前回の指摘/);
  assert.match(r2.stderr, /memo\.md: 「Zorblax 社」 — 顧客名/);
  assert.equal(second.prompt(), null);

  // 人が確認して push すると忘れ、その後に同じコミットを再び push するときはモデルに聞く
  assert.equal(
    push(dir, { stdin, command: second.command, env: { CRE_PUSH_REVIEWED: "1" } }).status,
    0,
  );
  const third = fakeReviewer(dir, '{"risk":"none","findings":[]}');
  assert.equal(push(dir, { stdin, command: third.command }).status, 0);
  assert.notEqual(third.prompt(), null);
});

test("CRE_PUSH_REVIEWED=1 なら AI レビューを飛ばして push する（人が付ける）", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "a.md"), "# ok\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: add a");
  const fake = fakeReviewer(dir, null);
  const r = push(dir, {
    stdin: newBranchLine(head()),
    command: fake.command,
    env: { CRE_PUSH_REVIEWED: "1" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /人が確認済み/);
  assert.equal(fake.prompt(), null);
});

test("機密の印があるコミットは、レビュアーに聞かずに止め、人の確認でも通さない", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "oops.md"), `詳細は ${privateRepo} を見る\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "docs: oops");
  const fake = fakeReviewer(dir, null);
  const r = push(dir, {
    stdin: newBranchLine(head()),
    command: fake.command,
    env: { CRE_PUSH_REVIEWED: "1" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /oops\.md:1/);
  assert.match(r.stderr, /人の確認でも通しません/);
  assert.equal(fake.prompt(), null);
});

test("レビュアーの出力が JSON でなければ push を止める", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "a.md"), "# ok\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: add a");
  const fake = fakeReviewer(dir, "問題ありません。");
  const r = push(dir, { stdin: newBranchLine(head()), command: fake.command });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /JSON として読めません/);
});

test("レビュアーの実行が失敗したら push を止める", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "a.md"), "# ok\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: add a");
  const r = push(dir, { stdin: newBranchLine(head()), command: "exit 3" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /実行に失敗/);
});

test("push するコミットが無ければ何もしない", () => {
  const { dir, head } = makeRepo();
  const fake = fakeReviewer(dir, null);
  const r = push(dir, {
    stdin: `refs/heads/main ${head()} refs/heads/main ${head()}\n`,
    command: fake.command,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fake.prompt(), null);
});

test("既存のブランチへの push では、リモートに無いコミットだけを読ませる", () => {
  const { dir, git, head } = makeRepo();
  const before = head();
  writeFileSync(path.join(dir, "a.md"), "# first\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: first");
  const middle = head();
  writeFileSync(path.join(dir, "b.md"), "# second\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: second");
  const fake = fakeReviewer(dir, '{"risk":"none","findings":[]}');
  const r = push(dir, {
    stdin: `refs/heads/main ${head()} refs/heads/main ${middle}\n`,
    command: fake.command,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /1 コミット/);
  const prompt = fake.prompt();
  assert.match(prompt, /docs: second/);
  assert.doesNotMatch(prompt, /docs: first/);
  assert.doesNotMatch(prompt, new RegExp(before.slice(0, 8)));
});
