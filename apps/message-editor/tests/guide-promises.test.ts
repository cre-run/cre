/**
 * 対応ガイド: apps/docs/docs/message-editor/data-handling.mdx
 *
 * ガイドの約束に付けた tested バッジ（リンク先がテストファイル、tooltip がテスト名）と、
 * 実際のテストが一致することを確かめる。
 * - バッジのテストは、リンク先のファイルに同じ名前で実在する（ガイドだけを変えると落ちる）
 * - 約束のテストファイルは、すべてのテストにバッジがある（テストだけを足す・バッジだけを外すと落ちる）
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
  title: string;
  file: string;
}

const BADGE =
  /<a href="https:\/\/github\.com\/cre-run\/cre\/blob\/main\/apps\/message-editor\/((?:e2e|tests)\/[^"]+\.ts)"><Badge [^>]*tooltip="([^"]+)"[^>]*>tested<\/Badge><\/a>/gu;

/** ガイドの tested バッジから、テスト名とファイルを取り出す */
const listedInGuide = (): Listed[] =>
  [...readFileSync(GUIDE, "utf8").matchAll(BADGE)].map((m) => ({ file: m[1]!, title: m[2]! }));

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
 * テストファイルで実際に実行される test("…") の名前。
 * esbuild で型とコメントを落としてから構文木にするので、行コメントとブロックコメントの中は数えない。
 * test.skip / test.only は呼び出し先が `test` ではないので数えず、describe.skip / describe.fixme の配下も数えない。
 */
const titlesInFile = async (file: string): Promise<string[]> => {
  const path = join(APP, file);
  const { code } = await transformWithEsbuild(readFileSync(path, "utf8"), path);
  const titles: string[] = [];
  const visit = (node: AstNode, inSkippedSuite: boolean): void => {
    let skipped = inSkippedSuite;
    if (node.type === "CallExpression" && isNode(node.callee)) {
      const callee = calleeName(node.callee);
      const [first] = node.arguments as unknown[];
      if (callee === "test" && !skipped && isNode(first) && first.type === "Literal") {
        titles.push(first.value as string);
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

test("バッジのテストは、リンク先のファイルに同じ名前で実在する", async () => {
  const listed = listedInGuide();
  expect(listed.length).toBeGreaterThan(0);
  for (const { title, file } of listed) {
    expect(PROMISE_TEST_FILES, `${file}: 約束のテストはこのファイルに置く`).toContain(file);
    expect(await titlesInFile(file), `${file}: 「${title}」`).toContain(title);
  }
});

test("約束のテストファイルのテストには、すべてバッジがある", async () => {
  const listed = listedInGuide();
  for (const file of PROMISE_TEST_FILES) {
    const badged = new Set(listed.filter((item) => item.file === file).map((item) => item.title));
    expect([...badged].sort(), file).toEqual((await titlesInFile(file)).sort());
  }
});
