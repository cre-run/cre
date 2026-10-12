/**
 * 対応ガイド: apps/docs/docs/short-url/index.mdx
 *
 * ガイドの流れ（Bot が作る → 組織のメールでログインして開く → Message Editor に移る）と、
 * 「開けないとき」の表の各行を、実際のブラウザでなぞる。Access のログイン画面の代わりに、
 * Access が付けるのと同じ JWT をテストがヘッダーに付ける（e2e/helpers.ts の browserAs）。
 * 画像は撮らない（短縮 URL の画面は固定の文言だけで、移った先は Message Editor のガイドで撮っている）。
 */
import { expect, test } from "@playwright/test";
import { MESSAGES } from "../src/app.ts";
import {
  BASE_URL,
  EDITOR_URL,
  ORG_DOMAIN,
  browserAs,
  createFails,
  createShortUrl,
  dataWithSubject,
} from "./helpers.ts";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

test("Bot が判定データを登録すると、短縮 URL（/id/<UUID>）が返る", async () => {
  const { id, url } = await createShortUrl(dataWithSubject("登録の確認"));
  expect(id).toMatch(UUID_V4);
  expect(url).toBe(`${BASE_URL}/id/${id}`);
});

test("組織のメールアドレスでログインして開くと、Message Editor にその判定データが表示される", async ({
  browser,
}) => {
  const subject = "短縮 URL から開いた件名";
  const data = dataWithSubject(subject);
  const { url } = await createShortUrl(data);

  const context = await browserAs(browser, `user@${ORG_DOMAIN}`);
  const page = await context.newPage();
  await page.goto(url);
  await expect(page).toHaveURL(`${EDITOR_URL}#d=${data}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(subject);
  await context.close();
});

test("開けないとき: URL が間違っていると「このリンクは開けません」", async ({ browser }) => {
  const context = await browserAs(browser, `user@${ORG_DOMAIN}`);
  const page = await context.newPage();
  const response = await page.goto(`${BASE_URL}/id/0f8c3a52-6b1e-4d7a-9c25-3e4f5a6b7c8d`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText(MESSAGES[404])).toBeVisible();
  await context.close();
});

test("開けないとき: 許可していないドメインのメールアドレスでは「このメールアドレスでは開けません」", async ({
  browser,
}) => {
  const { url } = await createShortUrl(dataWithSubject("ドメイン違い"));
  const context = await browserAs(browser, "user@other.example");
  const page = await context.newPage();
  const response = await page.goto(url);
  expect(response?.status()).toBe(403);
  await expect(page.getByText(MESSAGES[403])).toBeVisible();
  await context.close();
});

test("開けないとき: Access を通っていなければ「短縮 URL の設定が終わっていません」", async ({
  browser,
}) => {
  const { url } = await createShortUrl(dataWithSubject("Access なし"));
  const context = await browserAs(browser);
  const page = await context.newPage();
  const response = await page.goto(url);
  expect(response?.status()).toBe(503);
  await expect(page.getByText(MESSAGES[503])).toBeVisible();
  await context.close();
});

test("Message Editor が表示できないデータは登録できず、エラーになる", async () => {
  const error = await createFails("not-a-payload");
  expect(error).toContain("InvalidDataError");
});
