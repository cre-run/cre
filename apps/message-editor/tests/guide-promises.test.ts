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

/** テストファイルに書かれた test("…") の名前 */
const titlesInFile = (file: string): string[] =>
  [...readFileSync(join(APP, file), "utf8").matchAll(/\btest\(\s*"([^"]+)"/gu)].map((m) => m[1]!);

test("ガイドに挙げたテストは、書かれたファイルに同じ名前で実在する", () => {
  const listed = listedInGuide();
  expect(listed.length).toBeGreaterThan(0);
  for (const { title, file } of listed) {
    expect(titlesInFile(file), `${file}: 「${title}」`).toContain(title);
  }
});

test("約束のためだけにあるテストファイルは、すべてのテストがガイドに載っている", () => {
  const listed = listedInGuide();
  for (const file of PROMISE_ONLY_FILES) {
    const inGuide = listed.filter((item) => item.file === file).map((item) => item.title);
    expect(inGuide.sort(), file).toEqual(titlesInFile(file).sort());
  }
});

test("同じテストを二重に挙げていない", () => {
  const keys = listedInGuide().map(({ file, title }) => `${file}:${title}`);
  expect(new Set(keys).size).toBe(keys.length);
});
