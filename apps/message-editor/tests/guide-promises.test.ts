/**
 * 対応ガイド: apps/docs/docs/message-editor/data-handling.mdx
 *
 * ガイドの「テスト」列のバッジ（リンク先が約束のテストファイルの `#L<行>`、表示は E2E / 単体）と、
 * 実際のテストが一致することを確かめる。確かめ方は @cre/guide-promises（packages/guide-promises）にある。
 * 約束のテストは PROMISE_TEST_FILES にだけ置く。他のファイルへのバッジは「実在しない」扱いで落ちる。
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  badgePattern,
  declaredTests,
  expectedAnchors,
  labelFor,
  listedInGuide,
  promiseRows,
} from "@cre/guide-promises";
import { expect, test } from "vite-plus/test";

const APP = join(fileURLToPath(import.meta.url), "../..");
const APP_PATH = "apps/message-editor";
const GUIDE = join(APP, "../docs/docs/message-editor/data-handling.mdx");

/** 約束のテストを置くファイル。ここのテストにはすべてバッジを付け、バッジはここにしか付けない */
const PROMISE_TEST_FILES = [
  "e2e/guide-message-editor-data-handling.e2e.ts",
  "tests/data-handling.test.ts",
];

test("バッジのリンク先の行に、実行されるテストの宣言がある", async () => {
  const listed = listedInGuide(GUIDE, APP_PATH);
  expect(listed.length).toBeGreaterThan(0);
  for (const { file, line, label } of listed) {
    expect(PROMISE_TEST_FILES, `${file}: 約束のテストはこのファイルに置く`).toContain(file);
    expect(label, `${file}#L${line}: バッジの表示は確かめ方（E2E / 単体）と合わせる`).toBe(
      labelFor(file),
    );
    const declared = await declaredTests(APP, file);
    expect(
      declared.has(line),
      `${file}#L${line} にテストの宣言がない。正しいリンク先:\n${expectedAnchors(declared)}`,
    ).toBe(true);
  }
});

test("約束のテストファイルのテストには、すべてバッジがある", async () => {
  const listed = listedInGuide(GUIDE, APP_PATH);
  for (const file of PROMISE_TEST_FILES) {
    const declared = await declaredTests(APP, file);
    const badged = new Set(listed.filter((item) => item.file === file).map((item) => item.line));
    const missing = [...declared].filter(([line]) => !badged.has(line));
    expect(missing, `${file}: バッジのないテスト`).toEqual([]);
  }
});

test("約束の表の各行には、バッジか —（テストしない約束）がある", () => {
  const rows = promiseRows(GUIDE);
  expect(rows.length).toBeGreaterThan(0);
  for (const { label, tests } of rows) {
    expect(tests === "—" || badgePattern(APP_PATH).test(tests), `${label}: テスト列が空`).toBe(
      true,
    );
  }
});

test("同じテストを複数の約束に付けていない（1 つの行のバッジを外せば落ちるようにする）", () => {
  const keys = listedInGuide(GUIDE, APP_PATH).map(({ file, line }) => `${file}#L${line}`);
  const byText = (a: string, b: string) => a.localeCompare(b);
  expect([...new Set(keys)].sort(byText)).toEqual(keys.sort(byText));
});
