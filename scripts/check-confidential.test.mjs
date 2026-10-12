import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./check-confidential.mjs", import.meta.url));

// 検出パターンの断片を文字列の結合で組み立て、このテストファイル自身が検出されないようにする
const privateRepo = "cre-run/" + "cre-private";
const marker = "<!-- " + "CONFI" + "DENTIAL: " + privateRepo + " -->";
const internalScope = "@cre-internal" + "/";
const internalPkg = internalScope + "ops-cli";

function run(args, { input = "", env = {} } = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("問題のないテキストは通る", () => {
  const r = run(["--stdin-text"], { input: "# はじめに\n\nCRE のドキュメントです。\n" });
  assert.equal(r.status, 0, r.stderr);
});

test("機密の印を検出する", () => {
  const r = run(["--stdin-text"], { input: `${marker}\n\n# 戦略\n` });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /機密の印/);
});

test("非公開リポジトリへの参照を検出する", () => {
  const r = run(["--stdin-text"], { input: `詳しくは ${privateRepo} の docs を見る\n` });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /非公開リポジトリ/);
});

test("非公開パッケージのスコープを検出する", () => {
  const r = run(["--stdin-text"], { input: `import { x } from "${internalPkg}";\n` });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /非公開パッケージ/);
});

test("Claude Code の Write hook: 内容に印があれば終了コード 2 で拒否する", () => {
  const json = JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: "docs/x.md", content: `${marker}\n# x` },
  });
  const r = run(["--tool-input"], { input: json });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /docs\/x\.md:1/);
});

test("Claude Code の Edit hook: 問題のない new_string は通る", () => {
  const json = JSON.stringify({
    tool_name: "Edit",
    tool_input: { file_path: "README.md", old_string: "a", new_string: "b" },
  });
  const r = run(["--tool-input"], { input: json });
  assert.equal(r.status, 0, r.stderr);
});

test("Codex の apply_patch hook: 追加行に印があれば終了コード 2 で拒否する", () => {
  const patch = `*** Begin Patch\n*** Add File: docs/x.md\n+${marker}\n+# x\n*** End Patch\n`;
  const json = JSON.stringify({ tool_name: "apply_patch", tool_input: { command: patch } });
  const r = run(["--tool-input"], { input: json });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /機密の印/);
});

test("Codex の apply_patch hook: 印を含む行を削除するだけの patch は通る", () => {
  const patch = `*** Begin Patch\n*** Update File: docs/x.md\n@@\n-${privateRepo} を見る\n+内部資料に基づく\n*** End Patch\n`;
  const json = JSON.stringify({ tool_name: "apply_patch", tool_input: { command: patch } });
  const r = run(["--tool-input"], { input: json });
  assert.equal(r.status, 0, r.stderr);
});

test("Codex の apply_patch hook: 非公開パッケージのパスへの Move to は拒否する", () => {
  const patch = `*** Begin Patch\n*** Update File: docs/x.md\n*** Move to: ${internalScope}x.md\n*** End Patch\n`;
  const json = JSON.stringify({ tool_name: "apply_patch", tool_input: { command: patch } });
  const r = run(["--tool-input"], { input: json });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /非公開パッケージ/);
});

test("Claude Code の Bash hook: git commit 以外のコマンドは通る", () => {
  const json = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status --short" } });
  const r = run(["--if-git-command"], { input: json });
  assert.equal(r.status, 0, r.stderr);
});

test("Claude Code の Bash hook: git commit -m のメッセージに参照があれば拒否する", () => {
  const json = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: `git commit -m "docs: ${privateRepo} の方針を反映"` },
  });
  const r = run(["--if-git-command"], { input: json });
  assert.equal(r.status, 2);
});

test("Claude Code の Bash hook: 普通の git push は通る（AI レビューは pre-push が行う）", () => {
  const json = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "git push -u origin feat" },
  });
  const r = run(["--if-git-command"], { input: json });
  assert.equal(r.status, 0, r.stderr);
});

test("Claude Code の Bash hook: CRE_PUSH_* を触るコマンドと hook を迂回する git コマンドは拒否する", () => {
  for (const command of [
    "CRE_PUSH_REVIEWED=1 git push",
    "git push --no-verify",
    "env CRE_PUSH_REVIEWER=off git push origin main",
    "CRE_PUSH_REVIEW_COMMAND='echo {}' git push",
    "export CRE_PUSH_REVIEW_COMMAND='echo {}'", // git を含まないコマンドで先に設定するのも拒否
    "CRE_PUSH_REVIEW_MODEL=x git push",
    "git commit --no-verify -m x",
    "git -c core.hooksPath=/dev/null push",
    "git config core.hooksPath /dev/null",
  ]) {
    const json = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
    const r = run(["--if-git-command"], { input: json });
    assert.equal(r.status, 2, command);
    assert.match(r.stderr, /人だけ/);
  }
});

test("--message: コミットメッセージのファイルを検査する", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cc-"));
  const file = path.join(dir, "COMMIT_EDITMSG");
  writeFileSync(file, `feat: 追加\n\n${internalPkg} を使う\n`);
  const r = run(["--message", file]);
  assert.equal(r.status, 1);
});

// --- CI と pre-commit が実際に使う経路: 一時的な git リポジトリに機密を混ぜ、落ちることを確かめる ---

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "cc-repo-"));
  const git = (...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.com");
  writeFileSync(path.join(dir, "README.md"), "# clean\n");
  git("add", "-A");
  git("commit", "-q", "-m", "chore: clean");
  return { dir, git };
}

function runIn(dir, args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("--ci: 機密のないリポジトリは通る", () => {
  const { dir } = makeRepo();
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /問題なし/);
});

test("--ci: 追跡中のファイルに機密の印があれば落ち、GitHub の注釈を出す", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "leak.md"), `${marker}\n# 戦略\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "docs: add");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error file=leak\.md,line=1::/);
});

test("--ci: コミットせず追加しただけの未追跡ファイルも対象になる", () => {
  const { dir } = makeRepo();
  writeFileSync(path.join(dir, "notes.md"), `${privateRepo} を見る\n`);
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /notes\.md/);
});

test("--staged: 内容を変えない rename でも、新しいファイル名が非公開パッケージのパスなら落ちる", () => {
  const { dir, git } = makeRepo();
  mkdirSync(path.join(dir, internalScope));
  git("mv", "README.md", `${internalScope}README.md`);
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ファイル名に非公開パッケージ/);
});

test("--ci: バイナリ（PNG）は読み飛ばす", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "img.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
  git("add", "-A");
  git("commit", "-q", "-m", "chore: image");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("--staged: staged の差分に機密があれば落ち、staged でない変更は見ない", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "staged.md"), `${marker}\n`);
  writeFileSync(path.join(dir, "unstaged.md"), `${marker}\n`);
  git("add", "staged.md");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /staged\.md:1/);
  assert.doesNotMatch(r.stderr, /unstaged\.md/);
});

test("--staged: 機密のない差分は通る", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "ok.md"), "# ok\n");
  git("add", "-A");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 0, r.stderr);
});

test("--ci: BOM 付きの UTF-16（LE・BE）のテキストも検査する", () => {
  const { dir, git } = makeRepo();
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${privateRepo}\n`, "utf16le")]);
  const be = Buffer.from(le.subarray(2));
  be.swap16();
  writeFileSync(path.join(dir, "le.txt"), le);
  writeFileSync(path.join(dir, "be.txt"), Buffer.concat([Buffer.from([0xfe, 0xff]), be]));
  git("add", "-A");
  git("commit", "-q", "-m", "chore: utf16");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /le\.txt/);
  assert.match(r.stdout, /be\.txt/);
});

test("--ci: SVG はテキストとして検査し、コメント内の印を検出する", () => {
  const { dir, git } = makeRepo();
  writeFileSync(
    path.join(dir, "logo.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg">${marker}<title>x</title></svg>\n`,
  );
  git("add", "-A");
  git("commit", "-q", "-m", "chore: svg");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /logo\.svg/);
});

test("--ci: 非公開パッケージのパスにあるファイルは、内容が空でも落ちる", () => {
  const { dir, git } = makeRepo();
  mkdirSync(path.join(dir, internalScope));
  writeFileSync(path.join(dir, internalScope, "memo.md"), "");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ファイル名に非公開パッケージ/);
});

test("--staged: 非公開パッケージのパスへのファイルの追加は落ちる", () => {
  const { dir, git } = makeRepo();
  mkdirSync(path.join(dir, internalScope));
  writeFileSync(path.join(dir, internalScope, "notes.md"), "# empty\n");
  git("add", "-A");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ファイル名に非公開パッケージ/);
});

test("--ci: 検査スクリプトとテスト自身も除外せず検査し、このリポジトリは通る", () => {
  const r = runIn(path.dirname(path.dirname(script)), ["--ci"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("--ci: 検査スクリプトに非公開の内容が書かれたら落ちる（自分自身を除外しない）", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "scripts-check.mjs"), `// TODO: ${privateRepo} の方針を反映\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "chore: script");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
});

test("--ci: 拡張子が画像でも平文なら検査する（名前を変えただけでは逃れられない）", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "leak.png"), `${privateRepo} の内容\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "chore: image");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /leak\.png/);
});

test("--ci: シンボリックリンクはリンク先の文字列を検査する", () => {
  const { dir, git } = makeRepo();
  symlinkSync(`../${privateRepo}/docs`, path.join(dir, "internal-docs"));
  git("add", "-A");
  git("commit", "-q", "-m", "chore: link");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /リンク先に非公開リポジトリ/);
});

test("--ci: 公開される CI のログには検出した行の内容を出さない", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "memo.md"), `${privateRepo} の見積: 月額 999 万円\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error file=memo\.md,line=1::/);
  assert.doesNotMatch(r.stdout, /999 万円/);
});

test("--staged: 内容が ++ で始まる追加行も検査する（patch 上は +++ になる）", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "notes.md"), `++ ${privateRepo}\n`);
  git("add", "-A");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /notes\.md:1/);
});

test("--ci: ファイル名にパターンが一致したとき、公開ログにファイル名を出さない", () => {
  const { dir, git } = makeRepo();
  mkdirSync(path.join(dir, internalScope));
  writeFileSync(path.join(dir, internalScope, "secret-memo.md"), "# empty\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ファイル名に非公開パッケージ/);
  assert.doesNotMatch(r.stdout, /secret-memo/);
});

test("--ci: ファイル名がパターンに一致するとき、内容ヒットの注釈でもファイル名を伏せる", () => {
  const { dir, git } = makeRepo();
  mkdirSync(path.join(dir, internalScope));
  writeFileSync(path.join(dir, internalScope, "secret-memo.md"), `${marker}\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout, /secret-memo/);
});

test("--staged: 内容が ++ b/ で始まる行も diff ヘッダーと誤認せず検査する", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "notes.md"), `++ b/${privateRepo}\n`);
  git("add", "-A");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /notes\.md:1/);
});

test("--staged: .gitattributes で -diff を付けた staged ファイルの追加行も検査する", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, ".gitattributes"), "*.md -diff\n");
  writeFileSync(path.join(dir, "notes.md"), `${privateRepo}\n`);
  git("add", "-A");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /notes\.md:1/);
});

test("--staged: 日本語のファイル名の追加行も、クォートされずにそのファイル名で報告される", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "メモ.md"), `${privateRepo}\n`);
  git("add", "-A");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /メモ\.md:1/);
});
