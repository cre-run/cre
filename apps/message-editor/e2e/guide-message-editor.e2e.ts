/**
 * 対応ガイド: apps/docs/docs/message-editor/index.mdx
 *
 * ガイドの見出し（手順）と 1:1 で対応させる。ガイドの画像はこのテストが撮り、
 * apps/docs/docs/message-editor/<name>.png を比較の基準にする（差分があれば失敗）。
 * 基準を更新できるのは、PR に `update-screenshots` ラベルを付けて CI に撮り直させたときだけ。
 * 「根拠の種類」は一覧の説明なので手順にしない。「判定データの渡し方」の URL の例は critical-path で確かめる。
 */
import { expect, test, type Page } from "@playwright/test";
import { toHash } from "@cre/editor-payload";
import { samplePayload } from "../src/sample.ts";

const open = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "CSV インポートの仕様と、初期設定について",
  );
};

const reply = (page: Page) => page.getByRole("region", { name: "返信" });
const panel = (page: Page) => page.getByRole("complementary", { name: "選んだ箇所の根拠" });
const mark = (page: Page, text: string) =>
  reply(page).getByRole("button", { name: new RegExp(`^${text}`, "u") });

test.describe("Message Editor ガイド", () => {
  // Step 1/6: 画面の見方
  test("本文は読み取り専用で、判定した部分にだけ下線と確認状況のラベルが付く", async ({ page }) => {
    await open(page);
    await expect(page.locator("[contenteditable]")).toHaveCount(0);
    // ラベルは段落ではなく、下線のすぐ後ろに付く
    await expect(mark(page, "ただし、管理者が")).toContainText("条件あり");
    await expect(mark(page, "個別のご契約がある場合は")).toContainText("再確認");
    await expect(mark(page, "SSO をご利用の環境でも")).toHaveAccessibleName(/確認済み$/u);
    await expect(reply(page).getByRole("button", { name: /^要記入 解約後/u })).toContainText(
      "解約後、何日でデータを削除するか",
    );
    // 印のない文章（あいさつ）は選べない
    await expect(reply(page).getByRole("button", { name: /お問い合わせありがとう/u })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("改善アクション")).toBeVisible();
    await expect(page).toHaveScreenshot("message-editor.png");

    // 内訳は箇所の数。押すとその状態の箇所が選ばれる
    const summary = page.getByRole("group", { name: "確認状況の内訳" });
    await expect(summary).toHaveText(/確認済み 4.*条件あり 1.*再確認 1.*要記入 1/u);
    await summary.getByRole("button", { name: /要記入/u }).click();
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(
      "解約後、何日でデータを削除するか",
    );
  });

  // Step 2/6: 下線を選んで根拠を確かめる
  test("下線を選ぶと、その下線だけが強調され、右側にその下線の根拠が表示される", async ({
    page,
  }) => {
    await open(page);
    const recheck = mark(page, "個別のご契約がある場合は");
    await recheck.click();
    await expect(recheck).toHaveAttribute("aria-pressed", "true");
    await expect(mark(page, "ただし、管理者が")).toHaveAttribute("aria-pressed", "false");
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(
      "個別契約があるときの扱い",
    );
    await expect(panel(page)).toContainText("再確認");
    await panel(page)
      .getByRole("tab", { name: /評価/u })
      .click();
    await expect(panel(page).getByText("契約による違い")).toBeVisible();
    await expect(
      page.getByLabel("改善アクション").getByText("送る前にやること（2件）"),
    ).toBeVisible();
    // マウスを本文から外し、下線の hover の色を画像に入れない
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot("message-editor-recheck.png");

    // キーボードでも選べる
    await mark(page, "SSO をご利用の環境でも").focus();
    await page.keyboard.press("Enter");
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(
      "SSO 環境での API キー発行",
    );
    await panel(page)
      .getByRole("tab", { name: /質問/u })
      .click();
    await expect(panel(page)).toContainText("SSO でログインしています");
  });

  // Step 3/6: 空欄（要記入）を書き起こす
  test("空欄を選ぶと、案内・根拠のある選択肢・担当が表示される", async ({ page }) => {
    await open(page);
    await reply(page)
      .getByRole("button", { name: /^要記入 解約後/u })
      .click();
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(
      "解約後、何日でデータを削除するか",
    );
    await expect(panel(page)).toContainText("この箇所の文章は作っていません");
    await expect(panel(page)).toContainText("どちらが正しいかを確かめ");
    const options = panel(page).getByRole("region", { name: "選択肢" });
    await expect(options.getByText("30 日（利用規約）")).toBeVisible();
    await expect(options.getByText("60 日（削除処理の実装）")).toBeVisible();
    await expect(panel(page)).toContainText("担当: 開発担当・法務担当");
  });

  // Step 4/6: 送る前にやること
  test("送る前にやることは下線と空欄ごとに並び、「箇所を見る」でその箇所を選べる", async ({
    page,
  }) => {
    await open(page);
    const actions = page.getByLabel("改善アクション");
    await expect(actions.getByText("送る前にやること（2件）")).toBeVisible();
    await expect(actions.getByText("送った後のフォロー（1件）")).toBeVisible();
    await expect(page.getByRole("button", { name: "送る前にやること 残り 2 件" })).toBeVisible();

    const recheck = actions.getByRole("listitem").filter({ hasText: "個別契約があるときの扱い" });
    await recheck.getByRole("button", { name: /箇所を見る/u }).click();
    await expect(mark(page, "個別のご契約がある場合は")).toHaveAttribute("aria-pressed", "true");
    await recheck.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "送る前にやること 残り 1 件" })).toBeVisible();
  });

  // Step 5/6: 返信プレビュー
  test("返信プレビューでは、空欄が「［要記入：…］」として残り、件数が表示される", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: "返信プレビュー" }).click();
    const dialog = page.getByRole("dialog", { name: "返信プレビュー" });
    await expect(dialog).toContainText(
      "ご解約日から［要記入：解約後、何日でデータを削除するか］を経過した後に削除いたします。",
    );
    await expect(
      dialog.getByRole("alert").filter({ hasText: "要記入の空欄が 1 件" }),
    ).toBeVisible();
    await expect(dialog).not.toContainText("条件あり");
    await expect(dialog).not.toContainText("確認済み");
  });

  // Step 6/6: 速報モード（判定データの mode を flash にしたところ）
  test("速報の判定データでは、背景が警告色になり、上に速報モードの帯が表示される", async ({
    page,
  }) => {
    await page.goto(`/${toHash({ ...samplePayload, mode: "flash" })}`);
    await expect(page.getByRole("status").filter({ hasText: "速報モード" })).toBeVisible();
    await expect(page).toHaveScreenshot("message-editor-flash.png");
  });
});
