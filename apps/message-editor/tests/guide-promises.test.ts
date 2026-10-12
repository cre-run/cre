/**
 * 対応ガイド: apps/docs/docs/message-editor/data-handling.mdx
 *
 * ガイドの「テスト」列のバッジ（リンク先が約束のテストファイルの `#L<行>`、表示は E2E / 単体）と、
 * 実際のテストが一致することを確かめる。
 * - バッジのリンク先の行に、実行されるテストの宣言がある（ガイドだけを変える・テストの行がずれると落ちる。
 *   落ちたときは、正しい `#L<行>` の一覧を出力する）
 * - 約束のテストファイルのテストには、すべてバッジがある（テストだけを足す・バッジだけを外すと落ちる）
 * - 約束の表の各行には、バッジか —（テストしない約束）がある。同じテストを複数の約束に付けない
 *   （1 つの行のバッジを外しても、どこかの検査で必ず落ちる）
 * 約束のテストは PROMISE_TEST_FILES にだけ置く。他のファイルへのバッジは「実在しない」扱いで落ちる。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst, transformWithEsbuild } from "vite";
import { expect, test } from "vite-plus/test";

const APP = fileURLToPath(new URL("..", import.meta.url));
const GUIDE = join(APP, "../docs/docs/message-editor/data-handling.mdx");

/** 約束のテストを置くファイル。ここのテストにはすべてバッジを付け、バッジはここにしか付けない */
const PROMISE_TEST_FILES = [
  "e2e/guide-message-editor-data-handling.e2e.ts",
  "tests/data-handling.test.ts",
];

interface Listed {
  file: string;
  line: number;
  /** バッジの表示。e2e/ なら E2E、tests/ なら 単体 */
  label: string;
}

const labelFor = (file: string): string => (file.startsWith("e2e/") ? "E2E" : "単体");

const BADGE =
  /<a href="https:\/\/github\.com\/cre-run\/cre\/blob\/main\/apps\/message-editor\/((?:e2e|tests)\/[^"#]+\.ts)#L(\d+)"><Badge [^>]*>([^<]+)<\/Badge><\/a>/gu;

/** ガイドのバッジから、リンク先のファイルと行、表示を取り出す */
const listedInGuide = (): Listed[] =>
  [...readFileSync(GUIDE, "utf8").matchAll(BADGE)].map((m) => ({
    file: m[1]!,
    line: Number(m[2]),
    label: m[3]!,
  }));

/** 「テスト」列を持つ表の本文の行（最後の列がテスト列） */
const promiseRows = (): { label: string; tests: string }[] => {
  const rows: { label: string; tests: string }[] = [];
  let inPromiseTable = false;
  for (const line of readFileSync(GUIDE, "utf8").split("\n")) {
    if (!line.startsWith("|")) {
      inPromiseTable = false;
      continue;
    }
    const cells = line
      .slice(1, line.lastIndexOf("|"))
      .split("|")
      .map((cell) => cell.trim());
    if (cells.at(-1) === "テスト") {
      inPromiseTable = true;
    } else if (inPromiseTable && !/^-+$/u.test(cells[0]!)) {
      rows.push({ label: cells[0]!, tests: cells.at(-1)! });
    }
  }
  return rows;
};

/** ESTree のノード。必要な項目だけを見る */
interface AstNode {
  type: string;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";

/** `test` や `test.describe.skip` のような呼び出し先を文字列にする */
const calleeName = (node: AstNode): string | undefined => {
  if (node.type === "Identifier") {
    return node.name as string;
  }
  if (node.type === "MemberExpression" && isNode(node.object) && isNode(node.property)) {
    const object = calleeName(node.object);
    return object && node.property.type === "Identifier"
      ? `${object}.${node.property.name as string}`
      : undefined;
  }
  return undefined;
};

/**
 * 本文のどこかで `….skip(…)` / `….fixme(…)` を呼ぶ（実行時に skip する）か。
 * ファイル直下で定義した関数の呼び出し（`() => skipPromises()` のようなラッパー）も中まで追う。循環は seen で止める
 */
const skipsAtRuntime = (
  node: AstNode,
  functions: Map<string, AstNode[]>,
  seen: Set<AstNode> = new Set(),
): boolean => {
  if (seen.has(node)) {
    return false;
  }
  seen.add(node);
  if (node.type === "CallExpression" && isNode(node.callee)) {
    const { callee } = node;
    if (
      callee.type === "MemberExpression" &&
      isNode(callee.property) &&
      callee.property.type === "Identifier" &&
      ["skip", "fixme"].includes(callee.property.name as string)
    ) {
      return true;
    }
    if (callee.type === "Identifier") {
      const definitions = functions.get(callee.name as string) ?? [];
      if (definitions.some((definition) => skipsAtRuntime(definition, functions, seen))) {
        return true;
      }
    }
  }
  return Object.values(node).some((value) =>
    (Array.isArray(value) ? value : [value]).some(
      (child) => isNode(child) && skipsAtRuntime(child, functions, seen),
    ),
  );
};

/** ブロック直下の文のうち、関数呼び出しのもの */
const callStatements = (statements: unknown[]): AstNode[] =>
  statements.flatMap((statement) =>
    isNode(statement) &&
    statement.type === "ExpressionStatement" &&
    isNode(statement.expression) &&
    statement.expression.type === "CallExpression" &&
    isNode(statement.expression.callee)
      ? [statement.expression]
      : [],
  );

const isFunctionNode = (node: unknown): node is AstNode =>
  isNode(node) &&
  ["FunctionExpression", "ArrowFunctionExpression", "FunctionDeclaration"].includes(node.type);

/**
 * ファイルのどこかで定義された関数（`const f = () => …` / `function f() {}`）を名前で引けるようにする。
 * describe のコールバックの中など、入れ子の定義も集める。同じ名前が複数あれば、どれかが skip すれば
 * 「skip する」側に倒れるよう、すべて残す
 */
const localFunctions = (program: AstNode): Map<string, AstNode[]> => {
  const found = new Map<string, AstNode[]>();
  const add = (name: string, definition: AstNode): void => {
    found.set(name, [...(found.get(name) ?? []), definition]);
  };
  const visit = (node: AstNode): void => {
    if (node.type === "FunctionDeclaration" && isNode(node.id)) {
      add(node.id.name as string, node);
    }
    if (node.type === "VariableDeclarator" && isNode(node.id) && node.id.type === "Identifier") {
      if (isFunctionNode(node.init)) {
        add(node.id.name as string, node.init);
      }
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (isNode(child)) {
          visit(child);
        }
      }
    }
  };
  visit(program);
  return found;
};

/**
 * フックに渡した関数が、中で `….skip(…)` / `….fixme(…)` を呼ぶか。
 * インライン関数はその場で、識別子はファイル直下の定義を引いて調べる。
 * 解決できないもの（import した関数など）は、安全側に倒して「skip する」とみなす
 */
const hookSkips = (argument: unknown, functions: Map<string, AstNode[]>): boolean => {
  if (isFunctionNode(argument)) {
    return skipsAtRuntime(argument, functions);
  }
  if (isNode(argument) && argument.type === "Identifier") {
    const definitions = functions.get(argument.name as string) ?? [];
    return definitions.length === 0 || definitions.some((d) => skipsAtRuntime(d, functions));
  }
  return true;
};

/**
 * ブロック直下に、その範囲のテストをすべて skip する文があるか。Playwright では次のどちらも範囲全体に効く
 * - `test.skip(条件, …)` / `test.fixme(条件, …)`（第 1 引数が文字列の `test.skip("名前", fn)` は個々のテストの宣言なので除く）
 * - `test.beforeEach(fn)` / `test.beforeAll(fn)` の fn が中で `….skip(…)` / `….fixme(…)` を呼ぶもの
 */
const skipsScope = (statements: unknown[], functions: Map<string, AstNode[]>): boolean =>
  callStatements(statements).some((call) => {
    const callee = calleeName(call.callee as AstNode) ?? "";
    const [first] = call.arguments as unknown[];
    if (/^test\.(?:skip|fixme)$/u.test(callee)) {
      return !(isNode(first) && first.type === "Literal");
    }
    if (/^(?:test\.)?(?:beforeEach|beforeAll)$/u.test(callee)) {
      // beforeEach(fn) / beforeEach(タイトル, fn): フック関数は常に最後の引数
      return hookSkips((call.arguments as unknown[]).at(-1), functions);
    }
    return false;
  });

/**
 * テストファイルで実際に実行される test("…") の名前。
 * esbuild で型とコメントを落としてから構文木にするので、行コメントとブロックコメントの中は数えない。
 * test.skip / test.only は呼び出し先が `test` ではないので数えず、describe.skip / describe.fixme の配下も数えない。
 * 本文で test.skip(条件) や test.info().skip() を呼ぶテストも、約束を確かめていないので数えない。
 * ファイル直下や describe 直下の test.skip(条件, …) と、beforeEach / beforeAll に渡した関数（インラインでも
 * ファイル内で定義した関数でも）の中の skip / fixme は、その範囲のテストをすべて数えない。解決できないフックは skip 扱い。
 */
const titlesInFile = async (file: string): Promise<string[]> => {
  const path = join(APP, file);
  const { code } = await transformWithEsbuild(readFileSync(path, "utf8"), path);
  const program = parseAst(code) as unknown as AstNode;
  const functions = localFunctions(program);
  const titles: string[] = [];
  const visit = (node: AstNode, inSkippedSuite: boolean): void => {
    let skipped = inSkippedSuite;
    if (Array.isArray(node.body) && skipsScope(node.body, functions)) {
      skipped = true;
    }
    if (node.type === "CallExpression" && isNode(node.callee)) {
      const callee = calleeName(node.callee);
      const [first, body] = node.arguments as unknown[];
      if (callee === "test" && !skipped && isNode(first) && first.type === "Literal") {
        if (!(isNode(body) && skipsAtRuntime(body, functions))) {
          titles.push(first.value as string);
        }
      }
      if (callee && /^(?:test\.)?describe\.(?:skip|fixme)$/u.test(callee)) {
        skipped = true;
      }
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (isNode(child)) {
          visit(child, skipped);
        }
      }
    }
  };
  visit(program, false);
  return titles;
};

/**
 * 実行されるテストの宣言 `test("…")` がある行（1 始まり）。
 * esbuild の出力は行が変わるので、元のソースからタイトルで探す（コメントアウトした行は飛ばす）
 */
const declaredTests = async (file: string): Promise<Map<number, string>> => {
  const lines = readFileSync(join(APP, file), "utf8").split("\n");
  const byLine = new Map<number, string>();
  for (const title of await titlesInFile(file)) {
    const index = lines.findIndex(
      (line, i) =>
        !line.trimStart().startsWith("//") &&
        (line.includes(`test("${title}"`) ||
          (/^\s*test\(\s*$/u.test(line) && lines[i + 1]?.includes(`"${title}"`) === true)),
    );
    expect(index, `${file}: 「${title}」の宣言行`).toBeGreaterThanOrEqual(0);
    byLine.set(index + 1, title);
  }
  return byLine;
};

/** 落ちたときに貼り直せるよう、正しいリンク先の一覧にする */
const expectedAnchors = (declared: Map<number, string>): string =>
  [...declared].map(([line, title]) => `  #L${line}  ${title}`).join("\n");

test("バッジのリンク先の行に、実行されるテストの宣言がある", async () => {
  const listed = listedInGuide();
  expect(listed.length).toBeGreaterThan(0);
  for (const { file, line, label } of listed) {
    expect(PROMISE_TEST_FILES, `${file}: 約束のテストはこのファイルに置く`).toContain(file);
    expect(label, `${file}#L${line}: バッジの表示は確かめ方（E2E / 単体）と合わせる`).toBe(
      labelFor(file),
    );
    const declared = await declaredTests(file);
    expect(
      declared.has(line),
      `${file}#L${line} にテストの宣言がない。正しいリンク先:\n${expectedAnchors(declared)}`,
    ).toBe(true);
  }
});

test("約束のテストファイルのテストには、すべてバッジがある", async () => {
  const listed = listedInGuide();
  for (const file of PROMISE_TEST_FILES) {
    const declared = await declaredTests(file);
    const badged = new Set(listed.filter((item) => item.file === file).map((item) => item.line));
    const missing = [...declared].filter(([line]) => !badged.has(line));
    expect(missing, `${file}: バッジのないテスト`).toEqual([]);
  }
});

test("約束の表の各行には、バッジか —（テストしない約束）がある", () => {
  const rows = promiseRows();
  expect(rows.length).toBeGreaterThan(0);
  for (const { label, tests } of rows) {
    expect(tests === "—" || BADGE.test(tests), `${label}: テスト列が空`).toBe(true);
    BADGE.lastIndex = 0;
  }
});

test("同じテストを複数の約束に付けていない（1 つの行のバッジを外せば落ちるようにする）", () => {
  const keys = listedInGuide().map(({ file, line }) => `${file}#L${line}`);
  expect([...new Set(keys)].sort()).toEqual(keys.sort());
});
