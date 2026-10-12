import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
function fakeReviewer(dir, verdict) {
  const promptFile = path.join(dir, "prompt.txt");
  const answerFile = path.join(dir, "answer.txt");
  writeFileSync(answerFile, verdict ?? "");
  return {
    command: `cat > "${promptFile}" && cat "${answerFile}"`,
    prompt: () => (existsSync(promptFile) ? readFileSync(promptFile, "utf8") : null),
  };
}

/** pre-push と同じ呼び方: 引数にリモート、標準入力に ref の行。端末は無い */
function push(dir, { stdin, env = {}, command }) {
  const base = { ...process.env };
  for (const k of Object.keys(base)) if (k.startsWith("CRE_PUSH_")) delete base[k];
  return spawnSync(process.execPath, [script, "origin", "git@example.com:x/y.git"], {
    cwd: dir,
    input: stdin,
    encoding: "utf8",
    env: { ...base, ...env, ...(command ? { CRE_PUSH_REVIEW_COMMAND: command } : {}) },
  });
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

test("レビュアーには追加行とコミットメッセージを渡し、削除行と lockfile は渡さない", () => {
  const { dir, git, head } = makeRepo();
  writeFileSync(path.join(dir, "README.md"), "# clean\nnew line\n");
  writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\nsecret-looking: value\n");
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
  assert.match(prompt, /公開してはいけない内容/); // 指示も本文の先頭に入る
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
