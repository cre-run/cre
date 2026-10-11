/**
 * クリティカルパス: 壊れるとガイドの手順が成り立たなくなる操作を、画像を撮らずに速く確かめる。
 */
import { expect, test } from "@playwright/test";
import { toHash } from "../src/payload.ts";
import { samplePayload } from "../src/sample.ts";
import { guideExampleHashes } from "../tests/guide-example.ts";

test("見本データで画面が開く", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
  await expect(page.getByText("サンプル", { exact: true })).toBeVisible();
  await expect(page.locator(".paragraph")).toHaveCount(samplePayload.reply.paragraphs.length);
});

test("段落を選ぶと右パネルがその段落の根拠に切り替わる", async ({ page }) => {
  await page.goto("/");
  const panel = page.getByRole("complementary");
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("エラー行があるときの取り込み");
  await page.getByRole("button", { name: "段落 データの保存期間と削除 の根拠を見る" }).click();
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("データの保存期間と削除");
  await expect(panel.getByText("主張と食い違い")).toBeVisible();
});

test("送る前にやることをチェックすると、送れる状態になる", async ({ page }) => {
  await page.goto("/");
  const actions = page.getByLabel("改善アクション");
  await expect(actions.getByText("送る前にやること（1件）")).toBeVisible();
  await expect(actions.getByText("あと1件確認すると送れます")).toBeVisible();
  await actions.getByRole("checkbox", { name: "データの保存期間と削除 を確認済みにする" }).check();
  await expect(actions.getByText("すべて確認しました。このまま送れます")).toBeVisible();
});

test("返信プレビューには注釈が含まれない", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "返信プレビュー" }).click();
  const dialog = page.getByRole("dialog", { name: "返信プレビュー" });
  await expect(dialog.getByText(samplePayload.reply.paragraphs[0]!.text)).toBeVisible();
  await expect(dialog.getByText("確認済み")).toHaveCount(0);
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await expect(dialog).toBeHidden();
});

test("URL の判定データを表示する", async ({ page }) => {
  const payload = {
    ...samplePayload,
    inquiry: { ...samplePayload.inquiry, subject: "URL から渡した件名" },
  };
  await page.goto(`/${toHash(payload)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("URL から渡した件名");
  await expect(page.getByText("サンプル", { exact: true })).toHaveCount(0);
});

test("ガイドに載せた URL の例を開くと、見本と同じ内容が表示される", async ({ page }) => {
  const [encoded] = guideExampleHashes();
  await page.goto(`/#d=${encoded}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
  await expect(page.locator(".paragraph")).toHaveCount(samplePayload.reply.paragraphs.length);
  // URL から渡したデータなので、見本のバッジや読み込みエラーは出ない
  await expect(page.getByText("サンプル", { exact: true })).toHaveCount(0);
  await expect(page.getByText("URL のデータを読み込めませんでした")).toHaveCount(0);
});

test("壊れた判定データでは見本データとエラーを表示する", async ({ page }) => {
  await page.goto("/#d=broken");
  await expect(page.getByText("URL のデータを読み込めませんでした")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
});
