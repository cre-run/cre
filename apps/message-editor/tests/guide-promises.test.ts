/**
 * 対応ガイド: apps/docs/docs/message-editor/data-handling.mdx「確かめ方」
 *
 * ガイドに列挙したテスト名と、実際のテストが 1:1 で一致することを確かめる。
 * 約束を足したらテストを、テストを足したらガイドを直す（どちらかだけを変えると落ちる）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const APP = fileURLToPath(new URL("..", import.meta.url));
const GUIDE = join(APP, "../docs/docs/message-editor/data-handling.mdx");

/** 約束を確かめるテストファイル。増やしたらガイドの「確かめ方」にも節を足す */
const PROMISE_TEST_FILES = [
  "e2e/guide-message-editor-data-handling.e2e.ts",
  "tests/data-handling.test.ts",
];

/** ガイドの「確かめ方」から、テストファイルごとに「」で列挙したテスト名を取り出す */
const promisesInGuide = (): Map<string, string[]> => {
  const section = readFileSync(GUIDE, "utf8")
    .split(/^## 確かめ方$/mu)[1]
    ?.split(/^## /mu)[0];
  expect(section, "ガイドに「## 確かめ方」の節がある").toBeDefined();
  const byFile = new Map<string, string[]>();
  let current: string | undefined;
  for (const line of section!.split("\n")) {
    const file = /（`((?:e2e|tests)\/[^`]+\.ts)`）:\s*$/u.exec(line);
    if (file) {
      current = file[1];
      byFile.set(current, []);
      continue;
    }
    const title = /^- 「(.+)」$/u.exec(line);
    if (title && current) {
      byFile.get(current)!.push(title[1]!);
    }
  }
  return byFile;
};

/** テストファイルに書かれた test("…") の名前 */
const titlesInFile = (file: string): string[] =>
  [...readFileSync(join(APP, file), "utf8").matchAll(/\btest\(\s*"([^"]+)"/gu)].map((m) => m[1]!);

test("ガイドの「確かめ方」は、約束のテストファイルをすべて挙げている", () => {
  expect([...promisesInGuide().keys()].sort()).toEqual([...PROMISE_TEST_FILES].sort());
});

test("ガイドに挙げたテスト名と、実際のテスト名が 1:1 で一致する", () => {
  for (const [file, listed] of promisesInGuide()) {
    expect(listed.length, `${file}: ガイドに 1 件以上挙げている`).toBeGreaterThan(0);
    expect(titlesInFile(file), file).toEqual(listed);
  }
});
