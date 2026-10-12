/**
 * クリティカルパス: 壊れるとガイドの手順が成り立たなくなる操作を、画像を撮らずに速く確かめる。
 */
import { expect, test } from "@playwright/test";
import { toHash } from "@cre/editor-payload";
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
  await page.getByLabel("段落 データの保存期間と削除").click();
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("データの保存期間と削除");
  await panel.getByRole("tab", { name: /出典/u }).click();
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

test("確認の観点がない段落では、評価のタブを出さない（問題なしと誤って見せない）", async ({
  page,
}) => {
  const [first, ...rest] = samplePayload.reply.paragraphs;
  const payload = {
    ...samplePayload,
    reply: {
      ...samplePayload.reply,
      paragraphs: [{ ...first!, status: "unverified" as const, checks: [] }, ...rest],
    },
  };
  await page.goto(`/${toHash(payload)}`);
  const panel = page.getByRole("complementary");
  await expect(panel.getByText("根拠なし")).toBeVisible();
  await expect(panel.getByRole("tab", { name: /要点/u })).toBeVisible();
  await expect(panel.getByRole("tab", { name: /評価/u })).toHaveCount(0);
});

test("URL のデータが変わり、開いていたタブが無くなったら「要点」に戻る", async ({ page }) => {
  await page.goto("/#p=r1");
  const panel = page.getByRole("complementary");
  await panel.getByRole("tab", { name: /質問/u }).click();
  await expect(panel.getByRole("tab", { name: /質問/u })).toHaveAttribute("aria-selected", "true");

  // 同じ段落 ID のまま、質問への対応が無いデータへ切り替える（質問タブが無くなる）
  const [first, ...rest] = samplePayload.reply.paragraphs;
  const payload = {
    ...samplePayload,
    reply: { ...samplePayload.reply, paragraphs: [{ ...first!, respondsTo: [] }, ...rest] },
  };
  await page.evaluate(
    (hash) => {
      window.location.hash = hash;
    },
    `${toHash(payload).slice(1)}&p=r1`,
  );

  await expect(panel.getByRole("tab", { name: /質問/u })).toHaveCount(0);
  await expect(panel.getByRole("tab", { name: /要点/u })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("tabpanel")).toContainText(first!.summary);
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
