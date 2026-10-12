/**
 * 対応ガイド: apps/docs/docs/message-editor/data-handling.mdx「確かめ方」
 *
 * ガイドに約束ごとに列挙したテスト名と、実際のテストが一致することを確かめる。
 * - 列挙したテストは、書かれたファイルに同じ名前で実在する（ガイドだけを変えると落ちる）
 * - 約束のためだけにあるテストファイルは、すべてのテストが列挙されている（テストだけを足すと落ちる）
 * payload.test.ts や critical-path.e2e.ts のように約束以外のテストも持つファイルは、約束に関わるものだけを列挙する。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst, transformWithEsbuild } from "vite";
import { expect, test } from "vite-plus/test";

const APP = fileURLToPath(new URL("..", import.meta.url));
const GUIDE = join(APP, "../docs/docs/message-editor/data-handling.mdx");

/** 約束を確かめるためだけにあるファイル。ここのテストはすべてガイドに載せる */
const PROMISE_ONLY_FILES = [
  "e2e/guide-message-editor-data-handling.e2e.ts",
  "tests/data-handling.test.ts",
];

interface Listed {
  title: string;
  file: string;
}

/** ガイドの「確かめ方」から、「テスト名」（`ファイル`）の形で列挙したものを取り出す */
const listedInGuide = (): Listed[] => {
  const section = readFileSync(GUIDE, "utf8")
    .split(/^## 確かめ方$/mu)[1]
    ?.split(/^## /mu)[0];
  expect(section, "ガイドに「## 確かめ方」の節がある").toBeDefined();
  return [...section!.matchAll(/^- 「(.+)」（`((?:e2e|tests)\/[^`]+\.ts)`）$/gmu)].map((m) => ({
    title: m[1]!,
    file: m[2]!,
  }));
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

test("ガイドに挙げたテストは、書かれたファイルに同じ名前で実在する", async () => {
  const listed = listedInGuide();
  expect(listed.length).toBeGreaterThan(0);
  for (const { title, file } of listed) {
    expect(await titlesInFile(file), `${file}: 「${title}」`).toContain(title);
  }
});

test("約束のためだけにあるテストファイルは、すべてのテストがガイドに載っている", async () => {
  const listed = listedInGuide();
  for (const file of PROMISE_ONLY_FILES) {
    const inGuide = listed.filter((item) => item.file === file).map((item) => item.title);
    expect(inGuide.sort(), file).toEqual((await titlesInFile(file)).sort());
  }
});

test("同じテストを二重に挙げていない", () => {
  const keys = listedInGuide().map(({ file, title }) => `${file}:${title}`);
  expect(new Set(keys).size).toBe(keys.length);
});
