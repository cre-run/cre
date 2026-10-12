import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./check-confidential.mjs", import.meta.url));

// 検出パターンの断片を文字列の結合で組み立て、このテストファイル自身が検出されないようにする
const privateRepo = "cre-run/" + "cre-private";
const marker = "<!-- " + "CONFI" + "DENTIAL: " + privateRepo + " -->";
const internalPkg = "@cre-internal" + "/ops-cli";

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

test("環境変数の禁止語を検出する（大文字小文字を問わない）", () => {
  const r = run(["--stdin-text"], {
    input: "お客様の Example Corp から問い合わせ\n",
    env: { CONFIDENTIAL_TERMS: "# コメント\n\nexample corp\n" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /禁止語/);
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

test("Claude Code の Bash hook: git commit 以外のコマンドは通る", () => {
  const json = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status --short" } });
  const r = run(["--if-git-commit"], { input: json });
  assert.equal(r.status, 0, r.stderr);
});

test("Claude Code の Bash hook: git commit -m のメッセージに参照があれば拒否する", () => {
  const json = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: `git commit -m "docs: ${privateRepo} の方針を反映"` },
  });
  const r = run(["--if-git-commit"], { input: json });
  assert.equal(r.status, 2);
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
  // 環境変数の禁止語や範囲が外から混ざらないよう、テストで使うものだけを渡す
  const base = { ...process.env };
  delete base.CONFIDENTIAL_TERMS;
  delete base.CONFIDENTIAL_EXTRA_TEXT;
  delete base.CONFIDENTIAL_COMMIT_RANGE;
  return spawnSync(process.execPath, [script, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...base, ...env },
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

test("--ci: PR の題名・本文（CONFIDENTIAL_EXTRA_TEXT）に非公開パッケージがあれば落ちる", () => {
  const { dir } = makeRepo();
  const r = runIn(dir, ["--ci"], { CONFIDENTIAL_EXTRA_TEXT: `feat: ${internalPkg} を使う\n` });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PR の題名・本文/);
});

test("--ci: コミットメッセージの範囲（CONFIDENTIAL_COMMIT_RANGE）に参照があれば落ちる", () => {
  const { dir, git } = makeRepo();
  const base = git("rev-parse", "HEAD").stdout.trim();
  writeFileSync(path.join(dir, "a.txt"), "ok\n");
  git("add", "-A");
  git("commit", "-q", "-m", `chore: ${privateRepo} の方針に合わせる`);
  const head = git("rev-parse", "HEAD").stdout.trim();
  const r = runIn(dir, ["--ci"], { CONFIDENTIAL_COMMIT_RANGE: `${base}..${head}` });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /コミットメッセージ/);
});

test("--ci: 読めないコミット範囲は fail closed で失敗する", () => {
  const { dir } = makeRepo();
  const r = runIn(dir, ["--ci"], {
    CONFIDENTIAL_COMMIT_RANGE:
      "1111111111111111111111111111111111111111..2222222222222222222222222222222222222222",
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::コミットメッセージの範囲/);
});

test("--ci: before が全ゼロ（初回 push）のときは到達可能な全履歴を検査する", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "a.txt"), "ok\n");
  git("add", "-A");
  git("commit", "-q", "-m", `chore: ${privateRepo} を参照`);
  const head = git("rev-parse", "HEAD").stdout.trim();
  const bad = runIn(dir, ["--ci"], { CONFIDENTIAL_COMMIT_RANGE: `${"0".repeat(40)}..${head}` });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /コミットメッセージ/);
  const { dir: clean, git: git2 } = makeRepo();
  const head2 = git2("rev-parse", "HEAD").stdout.trim();
  const ok = runIn(clean, ["--ci"], { CONFIDENTIAL_COMMIT_RANGE: `${"0".repeat(40)}..${head2}` });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

test("--staged: 内容を変えない rename でも、新しいファイル名に禁止語があれば落ちる", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, ".confidential-terms.local"), "Zorblax\n");
  git("mv", "README.md", "zorblax.md");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ファイル名に禁止語/);
});

test("--ci: 禁止語ファイル .confidential-terms.local を読む", () => {
  const { dir } = makeRepo();
  writeFileSync(path.join(dir, ".confidential-terms.local"), "# 顧客\nAcme Widgets\n");
  writeFileSync(path.join(dir, "memo.md"), "acme widgets 向けの見積\n");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /禁止語/);
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

test("--ci: CONFIDENTIAL_REQUIRE_TERMS=true で Secret が未設定なら失敗する（fail closed）", () => {
  const { dir } = makeRepo();
  const r = runIn(dir, ["--ci"], { CONFIDENTIAL_REQUIRE_TERMS: "true" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::Secret CONFIDENTIAL_TERMS/);
});

test("--ci: コメント 1 行だけの Secret は「設定済み」として通る", () => {
  const { dir } = makeRepo();
  const r = runIn(dir, ["--ci"], {
    CONFIDENTIAL_REQUIRE_TERMS: "true",
    CONFIDENTIAL_TERMS: "# none\n",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("--ci: REQUIRE_TERMS でない実行（フォーク・Dependabot）は Secret なしでも警告を出して通る", () => {
  const { dir } = makeRepo();
  const r = runIn(dir, ["--ci"], { CONFIDENTIAL_REQUIRE_TERMS: "false" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /::warning::CONFIDENTIAL_TERMS/);
});

test("--ci: 禁止語を含むファイル名は、内容が空でも落ちる", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, ".confidential-terms.local"), "Zorblax\n");
  writeFileSync(path.join(dir, "zorblax-memo.md"), "");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ファイル名に禁止語/);
});

test("--staged: 禁止語を含むファイル名の追加は落ちる", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, ".confidential-terms.local"), "Zorblax\n");
  writeFileSync(path.join(dir, "notes-zorblax.md"), "# empty\n");
  git("add", "notes-zorblax.md");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ファイル名に禁止語/);
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
  writeFileSync(path.join(dir, ".confidential-terms.local"), "Zorblax\n");
  writeFileSync(path.join(dir, "memo.md"), "Zorblax との契約は月額 999 万円\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error file=memo\.md,line=1::/);
  assert.doesNotMatch(r.stdout, /999 万円/);
  assert.doesNotMatch(r.stdout, /Zorblax/);
});

test("--staged: 内容が ++ で始まる追加行も検査する（patch 上は +++ になる）", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "notes.md"), `++ ${privateRepo}\n`);
  git("add", "-A");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /notes\.md:1/);
});

test("--ci: ファイル名に禁止語が一致したとき、公開ログにファイル名を出さない", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, ".confidential-terms.local"), "Zorblax\n");
  writeFileSync(path.join(dir, "zorblax-memo.md"), "# empty\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ファイル名に禁止語/);
  assert.doesNotMatch(r.stdout, /zorblax/i);
});

test("--ci: 範囲内で追加してから削除したファイルの内容も検査する（履歴に残るため）", () => {
  const { dir, git } = makeRepo();
  const base = git("rev-parse", "HEAD").stdout.trim();
  writeFileSync(path.join(dir, "oops.md"), `${marker}\n# 戦略\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "docs: oops");
  git("rm", "-q", "oops.md");
  git("commit", "-q", "-m", "docs: remove");
  const head = git("rev-parse", "HEAD").stdout.trim();
  const r = runIn(dir, ["--ci"], { CONFIDENTIAL_COMMIT_RANGE: `${base}..${head}` });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /コミット [0-9a-f]{8} で追加/);
});

test("--ci: ファイル名が禁止語に一致するとき、内容ヒットの注釈でもファイル名を伏せる", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, ".confidential-terms.local"), "Zorblax\n");
  writeFileSync(path.join(dir, "zorblax.md"), "Zorblax の見積\n");
  git("add", "-A");
  git("commit", "-q", "-m", "docs: memo");
  const r = runIn(dir, ["--ci"]);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout, /zorblax/i);
});

test("--staged: 内容が ++ b/ で始まる行も diff ヘッダーと誤認せず検査する", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "notes.md"), `++ b/${privateRepo}\n`);
  git("add", "-A");
  const r = runIn(dir, ["--staged"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /notes\.md:1/);
});

test("CONFIDENTIAL_TERMS_FILE が指すファイル（非公開リポジトリの正本など）から禁止語を読む", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cc-terms-"));
  const file = path.join(dir, "confidential-terms.txt");
  writeFileSync(file, "# 正本\nZorblax\n");
  const r = run(["--stdin-text"], {
    input: "zorblax 向け\n",
    env: { CONFIDENTIAL_TERMS_FILE: file },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /禁止語/);
});

test("--ci: before が全ゼロでも、中間コミットで追加して削除した内容を検出する", () => {
  const { dir, git } = makeRepo();
  writeFileSync(path.join(dir, "oops.md"), `${marker}\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "docs: oops");
  git("rm", "-q", "oops.md");
  git("commit", "-q", "-m", "docs: remove");
  const head = git("rev-parse", "HEAD").stdout.trim();
  const r = runIn(dir, ["--ci"], { CONFIDENTIAL_COMMIT_RANGE: `${"0".repeat(40)}..${head}` });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /コミット [0-9a-f]{8} で追加/);
});

test("CONFIDENTIAL_TERMS_FILE が指すファイルが無ければ終了コード 2 で失敗する", () => {
  const r = run(["--stdin-text"], {
    input: "ok\n",
    env: { CONFIDENTIAL_TERMS_FILE: "/nonexistent/terms.txt" },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /CONFIDENTIAL_TERMS_FILE/);
});

test("--ci: 最終コミットの .gitattributes で -diff を付けても、中間コミットの追加内容を検査する", () => {
  const { dir, git } = makeRepo();
  const base = git("rev-parse", "HEAD").stdout.trim();
  writeFileSync(path.join(dir, "oops.md"), `${marker}\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "docs: oops");
  git("rm", "-q", "oops.md");
  writeFileSync(path.join(dir, ".gitattributes"), "oops.md -diff\n*.md -diff\n");
  git("add", "-A");
  git("commit", "-q", "-m", "chore: attributes");
  const head = git("rev-parse", "HEAD").stdout.trim();
  const r = runIn(dir, ["--ci"], { CONFIDENTIAL_COMMIT_RANGE: `${base}..${head}` });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /コミット [0-9a-f]{8} で追加/);
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
