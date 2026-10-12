/**
 * 対応ガイド: apps/docs/docs/short-url/data-handling.mdx
 *
 * 「短縮 URL を開ける人」の約束を、実際のブラウザで確かめる（コードの形の確かめは tests/data-handling.test.ts）。
 * 約束のテストはこのファイルと tests/data-handling.test.ts にだけ置く（ガイドのバッジと tests/guide-promises.test.ts が突き合わせる）。
 * 画像は撮らない（見た目ではなく、どこまで移るかと何が表示されるかを見る）。
 */
import { expect, test } from "@playwright/test";
import { PORTS } from "./ports.ts";
import { ORG_DOMAIN, browserAs, createShortUrl, dataWithSubject } from "./helpers.ts";

test("ログインしていない人・組織の外の人は、短縮 URL を開いても Message Editor に移らず、判定データも見えない", async ({
  browser,
}) => {
  const subject = "組織の外には見せない件名";
  const data = dataWithSubject(subject);
  const { url } = await createShortUrl(data);

  for (const email of [undefined, "user@other.example", `user@sub.${ORG_DOMAIN}`]) {
    const context = await browserAs(browser, email);
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(url);
    expect(new URL(page.url()).port, String(email)).toBe(String(PORTS.shortUrl));
    expect(requests.some((request) => new URL(request).port === String(PORTS.editor))).toBe(false);
    expect(await page.content()).not.toContain(data);
    await expect(page.getByText(subject)).toHaveCount(0);
    await context.close();
  }
});
