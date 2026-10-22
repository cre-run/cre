/**
 * 対応ガイド: apps/docs/docs/message-editor/index.mdx
 *
 * ガイドの手順・画像と 1:1 で対応させる。ガイドの画像はこのテストが撮り、
 * apps/docs/docs/message-editor/<name>.png を比較の基準にする（差分があれば失敗）。
 * 基準を更新できるのは、PR に `update-screenshots` ラベルを付けて CI に撮り直させたときだけ。
 */
import { expect, test } from "@playwright/test";
import { toHash } from "@cre/editor-payload";
import { samplePayload } from "../src/sample.ts";

test.describe("Message Editor ガイド", () => {
  // Step 1/3: 画面の見方（確認済みの段落を選んだところ）
  test("段落を選ぶと、右側にその段落の根拠が表示される", async ({ page }) => {
    await page.goto("/#p=r1");
    const panel = page.getByRole("complementary");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      "エラー行があるときの取り込み",
    );
    await expect(page.getByLabel("改善アクション")).toBeVisible();
    await expect(page).toHaveScreenshot("message-editor.png");
  });

  // Step 2/3: 段落の確認状況（再確認が必要な段落の「評価」タブと、送る前にやること）
  test("再確認が必要な段落では、「評価」タブで観点ごとの評価を確かめられる", async ({ page }) => {
    await page.goto("/#p=r3");
    const panel = page.getByRole("complementary");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText("データの保存期間と削除");
    await panel.getByRole("tab", { name: /評価/u }).click();
    await expect(panel.getByText("実装との一致")).toBeVisible();
    await expect(
      page.getByLabel("改善アクション").getByText("送る前にやること（1件）"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("message-editor-recheck.png");
  });

  // Step 3/3: 速報モード（判定データの mode を flash にしたところ）
  test("速報の判定データでは、背景が警告色になり、上に速報モードの帯が表示される", async ({
    page,
  }) => {
    await page.goto(`/${toHash({ ...samplePayload, mode: "flash" })}`);
    await expect(page.getByRole("status").filter({ hasText: "速報モード" })).toBeVisible();
    await expect(page.locator(".badge-flash")).toHaveText("速報");
    await expect(page).toHaveScreenshot("message-editor-flash.png");
  });
});
