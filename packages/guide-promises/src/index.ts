/**
 * 約束のガイド（data-handling.mdx）の「テスト」列のバッジと、実際のテストを突き合わせるための道具。
 * 各アプリの tests/guide-promises.test.ts から使い、次を確かめる。
 * - バッジのリンク先の行に、実行されるテストの宣言がある（ガイドだけを変える・テストの行がずれると落ちる）
 * - 約束のテストファイルのテストには、すべてバッジがある（テストだけを足す・バッジだけを外すと落ちる）
 * - 約束の表の各行には、バッジか —（テストしない約束）がある。同じテストを複数の約束に付けない
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAst, transformWithEsbuild } from "vite";

export interface Listed {
  file: string;
  line: number;
  /** バッジの表示。e2e/ なら E2E、tests/ なら 単体 */
  label: string;
}

export interface PromiseRow {
  label: string;
  tests: string;
}

export const labelFor = (file: string): string => (file.startsWith("e2e/") ? "E2E" : "単体");

const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, "\\$&");

/** バッジの形。appPath はリポジトリのルートからのアプリのパス（例: apps/message-editor） */
export const badgePattern = (appPath: string): RegExp =>
  new RegExp(
    `<a href="https://github\\.com/cre-run/cre/blob/main/${escapeRegExp(appPath)}/((?:e2e|tests)/[^"#]+\\.ts)#L(\\d+)"><Badge [^>]*>([^<]+)</Badge></a>`,
    "gu",
  );

/** ガイドのバッジから、リンク先のファイルと行、表示を取り出す */
export const listedInGuide = (guide: string, appPath: string): Listed[] =>
  [...readFileSync(guide, "utf8").matchAll(badgePattern(appPath))].map((m) => ({
    file: m[1]!,
    line: Number(m[2]),
    label: m[3]!,
  }));

/** 「テスト」列を持つ表の本文の行（最後の列がテスト列） */
export const promiseRows = (guide: string): PromiseRow[] => {
  const rows: PromiseRow[] = [];
  let inPromiseTable = false;
  for (const line of readFileSync(guide, "utf8").split("\n")) {
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
 * ブロック直下に `test.skip(条件, …)` / `test.fixme(条件, …)` の文があるか。
 * Playwright ではファイル直下や describe 直下に置くと、その範囲のテストがすべて skip される
 */
const skipsScope = (statements: unknown[]): boolean =>
  statements.some(
    (statement) =>
      isNode(statement) &&
      statement.type === "ExpressionStatement" &&
      isNode(statement.expression) &&
      statement.expression.type === "CallExpression" &&
      isNode(statement.expression.callee) &&
      /^test\.(?:skip|fixme)$/u.test(calleeName(statement.expression.callee) ?? "") &&
      // test.skip("名前", fn) は個々のテストの宣言なので、ここでは数えない
      !(
        isNode((statement.expression.arguments as unknown[])[0]) &&
        ((statement.expression.arguments as unknown[])[0] as AstNode).type === "Literal"
      ),
  );

/** 本文のどこかで `….skip(…)` / `….fixme(…)` を呼ぶ（実行時に skip する）テストか */
const skipsAtRuntime = (node: AstNode): boolean => {
  if (
    node.type === "CallExpression" &&
    isNode(node.callee) &&
    node.callee.type === "MemberExpression" &&
    isNode(node.callee.property) &&
    node.callee.property.type === "Identifier" &&
    ["skip", "fixme"].includes(node.callee.property.name as string)
  ) {
    return true;
  }
  return Object.values(node).some((value) =>
    (Array.isArray(value) ? value : [value]).some(
      (child) => isNode(child) && skipsAtRuntime(child),
    ),
  );
};

/**
 * テストファイルで実際に実行される test("…") の名前。
 * esbuild で型とコメントを落としてから構文木にするので、行コメントとブロックコメントの中は数えない。
 * test.skip / test.only は呼び出し先が `test` ではないので数えず、describe.skip / describe.fixme の配下も数えない。
 * 本文で test.skip(条件) や test.info().skip() を呼ぶテストも、約束を確かめていないので数えない。
 * ファイル直下や describe 直下の test.skip(条件, …) は、その範囲のテストをすべて数えない。
 */
const titlesInFile = async (path: string): Promise<string[]> => {
  const { code } = await transformWithEsbuild(readFileSync(path, "utf8"), path);
  const titles: string[] = [];
  const visit = (node: AstNode, inSkippedSuite: boolean): void => {
    let skipped = inSkippedSuite;
    if (Array.isArray(node.body) && skipsScope(node.body)) {
      skipped = true;
    }
    if (node.type === "CallExpression" && isNode(node.callee)) {
      const callee = calleeName(node.callee);
      const [first, body] = node.arguments as unknown[];
      if (callee === "test" && !skipped && isNode(first) && first.type === "Literal") {
        if (!(isNode(body) && skipsAtRuntime(body))) {
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
  visit(parseAst(code) as unknown as AstNode, false);
  return titles;
};

/**
 * 実行されるテストの宣言 `test("…")` がある行（1 始まり）。
 * esbuild の出力は行が変わるので、元のソースからタイトルで探す（コメントアウトした行は飛ばす）。
 * 宣言行が見つからないテストがあれば例外を投げる
 */
export const declaredTests = async (app: string, file: string): Promise<Map<number, string>> => {
  const path = join(app, file);
  const lines = readFileSync(path, "utf8").split("\n");
  const byLine = new Map<number, string>();
  for (const title of await titlesInFile(path)) {
    const index = lines.findIndex(
      (line, i) =>
        !line.trimStart().startsWith("//") &&
        (line.includes(`test("${title}"`) ||
          (/^\s*test\(\s*$/u.test(line) && lines[i + 1]?.includes(`"${title}"`) === true)),
    );
    if (index < 0) {
      throw new Error(`${file}: 「${title}」の宣言行が見つからない`);
    }
    byLine.set(index + 1, title);
  }
  return byLine;
};

/** 落ちたときに貼り直せるよう、正しいリンク先の一覧にする */
export const expectedAnchors = (declared: Map<number, string>): string =>
  [...declared].map(([line, title]) => `  #L${line}  ${title}`).join("\n");
