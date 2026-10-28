/**
 * クリティカルパス: 壊れるとガイドの手順が成り立たなくなる操作を、画像を撮らずに速く確かめる。
 */
import { expect, test, type Page } from "@playwright/test";
import { encodePayload, toHash, type ReplyReviewPayload } from "@cre/editor-payload";
import { paragraphText } from "../src/reader.ts";
import { samplePayload } from "../src/sample.ts";
import { guideExampleHashes } from "../tests/guide-example.ts";
import { withAssertion } from "../tests/sample-edit.ts";

const panel = (page: Page) => page.getByRole("complementary", { name: "選んだ箇所の根拠" });
const mark = (page: Page, text: string) =>
  page
    .getByRole("region", { name: "返信" })
    .getByRole("button", { name: new RegExp(`^${text}`, "u") });

test("見本データで画面が開き、本文は読み取り専用", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
  await expect(page.getByText("サンプル", { exact: true })).toBeVisible();
  await expect(page.locator(".reader-paragraph")).toHaveCount(
    samplePayload.reply.paragraphs.length,
  );
  await expect(page.locator("[contenteditable]")).toHaveCount(0);
  // 最初は、本文の順で最初の確認済み以外の下線が選ばれている
  await expect(mark(page, "ただし、管理者が")).toHaveAttribute("aria-pressed", "true");
});

test("下線を選ぶと右パネルがその下線の根拠に切り替わる", async ({ page }) => {
  await page.goto("/");
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(
    "SSO の強制が有効なときの手順",
  );
  await mark(page, "エラーのある行が含まれていても").click();
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(
    "エラー行があるときの取り込み",
  );
  await panel(page)
    .getByRole("tab", { name: /出典/u })
    .click();
  await expect(panel(page).getByText("支持 2")).toBeVisible();
});

test("送る前にやることをチェックすると、送れる状態になる", async ({ page }) => {
  await page.goto("/");
  const actions = page.getByLabel("改善アクション");
  await expect(actions.getByText("送る前にやること（2件）")).toBeVisible();
  await expect(actions.getByText("あと2件確認すると送れます")).toBeVisible();
  await actions
    .getByRole("checkbox", { name: "個別契約があるときの扱い を確認済みにする" })
    .check();
  await actions
    .getByRole("checkbox", { name: "解約後、何日でデータを削除するか を確認済みにする" })
    .check();
  await expect(actions.getByText("すべて確認しました。このまま送れます")).toBeVisible();
  await expect(page.getByRole("button", { name: /送る前の確認 完了/u })).toBeVisible();
});

test("返信プレビューには注釈が含まれない", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "返信プレビュー" }).click();
  const dialog = page.getByRole("dialog", { name: "返信プレビュー" });
  await expect(dialog.getByText(paragraphText(samplePayload.reply.paragraphs[0]!))).toBeVisible();
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

test("version 1（段落ごとの判定）の URL は表示せず、作り直しを案内する", async ({ page }) => {
  const v1 = { ...samplePayload, version: 1 } as unknown as ReplyReviewPayload;
  await page.goto(`/#d=${encodePayload(v1)}`);
  await expect(page.getByText("URL のデータを読み込めませんでした")).toContainText(
    "version 2 で URL を作り直してください",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
});

test("判定データで指定した時機の欄に、次のアクションを表示する", async ({ page }) => {
  // 見本: a3 は条件あり（既定は送った後）、a4 は再確認（既定は送る前）。それぞれ逆の欄を指定する
  const payload = withAssertion(
    withAssertion(samplePayload, "a3", (a) => ({ ...a, nextActionTiming: "beforeSend" })),
    "a4",
    (a) => ({ ...a, nextActionTiming: "afterSend" }),
  );
  await page.goto(`/${toHash(payload)}`);
  const actions = page.getByLabel("改善アクション");
  await expect(actions.getByText("送る前にやること（2件）")).toBeVisible();
  await expect(
    actions.getByRole("checkbox", { name: "SSO の強制が有効なときの手順 を確認済みにする" }),
  ).toBeVisible();
  await expect(actions.getByText("送った後のフォロー（1件）")).toBeVisible();
  // 再確認の下線を送った後に回したときは、お客様の回答待ちとは案内しない
  await expect(actions.getByText("送った後に対応します")).toBeVisible();
  await expect(actions.getByText("お客様の回答を受けて対応します")).toHaveCount(0);
});

test("確認の観点がない下線では、評価のタブを出さない（問題なしと誤って見せない）", async ({
  page,
}) => {
  await page.goto(`/${toHash(withAssertion(samplePayload, "a3", (a) => ({ ...a, checks: [] })))}`);
  await expect(panel(page).getByRole("tab", { name: /要点/u })).toBeVisible();
  await expect(panel(page).getByRole("tab", { name: /評価/u })).toHaveCount(0);
});

test("URL のデータが変わり、開いていたタブが無くなったら「要点」に戻る", async ({ page }) => {
  await page.goto("/#f=a1");
  await panel(page)
    .getByRole("tab", { name: /質問/u })
    .click();
  await expect(panel(page).getByRole("tab", { name: /質問/u })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 同じ下線 ID のまま、質問への対応が無いデータへ切り替える（質問タブが無くなる）
  const [first, ...rest] = samplePayload.reply.paragraphs;
  const payload = {
    ...samplePayload,
    reply: { ...samplePayload.reply, paragraphs: [{ ...first!, respondsTo: [] }, ...rest] },
  };
  await page.evaluate(
    (hash) => {
      window.location.hash = hash;
    },
    `${toHash(payload).slice(1)}&f=a1`,
  );
  await expect(panel(page).getByRole("tab", { name: /質問/u })).toHaveCount(0);
  await expect(panel(page).getByRole("tab", { name: /要点/u })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("ガイドに載せた URL の例を開くと、見本と同じ内容が表示される", async ({ page }) => {
  const [encoded] = guideExampleHashes();
  await page.goto(`/#d=${encoded}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
  await expect(page.getByRole("group", { name: "確認状況の内訳" })).toContainText("要記入 1");
  // URL から渡したデータなので、見本のバッジや読み込みエラーは出ない
  await expect(page.getByText("サンプル", { exact: true })).toHaveCount(0);
  await expect(page.getByText("URL のデータを読み込めませんでした")).toHaveCount(0);
});

test("確認状況の内訳を押すと、その状態の箇所へ順に移動する", async ({ page }) => {
  await page.goto("/");
  const summary = page.getByRole("group", { name: "確認状況の内訳" });
  const verified = summary.getByRole("button", { name: /確認済み/u });
  // 最初は条件ありの下線（段落 2）が選ばれているので、その後ろの確認済みから順に移動し、最後まで行ったら先頭に戻る
  await verified.click();
  await expect(mark(page, "サポート窓口で")).toHaveAttribute("aria-pressed", "true");
  await verified.click();
  await expect(mark(page, "パスワードなどの認証情報")).toHaveAttribute("aria-pressed", "true");
  await verified.click();
  await expect(mark(page, "エラーのある行が含まれていても")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await summary.getByRole("button", { name: /再確認/u }).click();
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(
    "個別契約があるときの扱い",
  );
});

test("送る前にやることが残っているときは、返信プレビューに残りの件数と空欄の件数を表示する", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "返信プレビュー" }).click();
  const dialog = page.getByRole("dialog", { name: "返信プレビュー" });
  await expect(dialog.getByRole("alert").first()).toContainText(
    "送る前にやることが残り 2 件あります",
  );
  await expect(dialog.getByRole("alert").nth(1)).toContainText("要記入の空欄が 1 件あります");
  await dialog.getByRole("button", { name: "閉じる" }).click();

  const actions = page.getByLabel("改善アクション");
  for (const name of ["個別契約があるときの扱い", "解約後、何日でデータを削除するか"]) {
    await actions.getByRole("checkbox", { name: `${name} を確認済みにする` }).check();
  }
  await page.getByRole("button", { name: "返信プレビュー" }).click();
  // チェックを付けても、空欄は書き起こすまで残るので件数を出し続ける
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  await expect(dialog.getByRole("alert")).toContainText("要記入の空欄が 1 件あります");
});

test("判定データが速報（mode: flash）のときは、上部に速報モードの帯を出す", async ({ page }) => {
  const banner = page.getByRole("status").filter({ hasText: "速報モード" });

  await page.goto(`/${toHash({ ...samplePayload, mode: "flash" })}`);
  await expect(banner).toBeVisible();
  await expect(page.locator(".app")).toHaveClass(/is-flash/u);

  // 完成版（mode を省略・standard）では出さない。実データの mode は URL の #mode= で上書きしない
  await page.goto(`/${toHash({ ...samplePayload, mode: "standard" })}&mode=flash`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
  await expect(banner).toHaveCount(0);
});

test("速報モードでも、返信プレビューは帯に覆われず閉じられる", async ({ page }) => {
  // 狭い画面では帯が折り返して高くなり、ダイアログの上端に重なりうる
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`/${toHash({ ...samplePayload, mode: "flash" })}`);
  await page.getByRole("button", { name: "返信プレビュー" }).click();
  const dialog = page.getByRole("dialog", { name: "返信プレビュー" });
  // 帯が前面にあると、クリックが帯に遮られて失敗する
  await dialog.getByRole("button", { name: "閉じる" }).click({ timeout: 2000 });
  await expect(dialog).toBeHidden();
});
