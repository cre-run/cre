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

test("判定データで指定した時機の欄に、次のアクションを表示する", async ({ page }) => {
  // 見本: r2 は条件あり（既定は送った後）、r3 は再確認（既定は送る前）。それぞれ逆の欄を指定する
  const payload = {
    ...samplePayload,
    reply: {
      ...samplePayload.reply,
      paragraphs: samplePayload.reply.paragraphs.map((p) =>
        p.id === "r2"
          ? { ...p, nextActionTiming: "beforeSend" as const }
          : p.id === "r3"
            ? { ...p, nextActionTiming: "afterSend" as const }
            : p,
      ),
    },
  };
  await page.goto(`/${toHash(payload)}`);
  const actions = page.getByLabel("改善アクション");
  await expect(actions.getByText("送る前にやること（1件）")).toBeVisible();
  await expect(
    actions.getByRole("checkbox", { name: "SSO 環境での API キー発行 を確認済みにする" }),
  ).toBeVisible();
  await expect(actions.getByText("送った後のフォロー（1件）")).toBeVisible();
  // 再確認の段落を送った後に回したときは、お客様の回答待ちとは案内しない
  await expect(actions.getByText("送った後に対応します")).toBeVisible();
  await expect(actions.getByText("お客様の回答を受けて対応します")).toHaveCount(0);
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

  // 質問のあるデータへ戻しても、前に開いていた「質問」が勝手に選び直されない
  await page.evaluate(
    (hash) => {
      window.location.hash = hash;
    },
    `${toHash(samplePayload).slice(1)}&p=r1`,
  );
  await expect(panel.getByRole("tab", { name: /質問/u })).toBeVisible();
  await expect(panel.getByRole("tab", { name: /要点/u })).toHaveAttribute("aria-selected", "true");
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

test("確認状況の内訳を押すと、その状態の段落へ移動する", async ({ page }) => {
  await page.goto("/");
  const summary = page.getByRole("group", { name: "確認状況の内訳" });
  await expect(summary.getByRole("button")).toHaveText([
    /確認済み\s*2/u,
    /条件あり\s*1/u,
    /再確認\s*1/u,
  ]);
  await summary.getByRole("button", { name: /再確認/u }).click();
  await expect(page.getByRole("complementary").getByRole("heading", { level: 3 })).toHaveText(
    "データの保存期間と削除",
  );
  // 確認済みは 2 段落あるので、押すたびに今の段落より後ろの段落へ移り、最後まで行ったら先頭に戻る
  await summary.getByRole("button", { name: /確認済み/u }).click();
  await expect(page.getByLabel("段落 初期設定のサポート")).toHaveAttribute("aria-current", "true");
  await summary.getByRole("button", { name: /確認済み/u }).click();
  await expect(page.getByLabel("段落 エラー行があるときの取り込み")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("段落の中で確かめが必要な文に印が付き、書き換えると「編集済み」になって印が消える", async ({
  page,
}) => {
  await page.goto("/");
  const paragraph = page.getByLabel("段落 SSO 環境での API キー発行");
  // 確認済みの文には印を付けず、条件ありの文だけに付ける
  await expect(paragraph.locator("mark")).toHaveCount(1);
  await expect(paragraph.locator("mark")).toContainText("SSO の強制");
  await expect(paragraph.getByText("編集済み")).toHaveCount(0);

  const text = paragraph.locator(".paragraph-text");
  await text.click();
  await page.keyboard.press("End");
  await page.keyboard.type("（追記）");
  await page.getByRole("heading", { level: 1 }).click();

  await expect(paragraph.getByText("編集済み")).toBeVisible();
  await expect(paragraph.locator("mark")).toHaveCount(0);
  await expect(text).toContainText("（追記）");
  await paragraph.click();
  await expect(page.getByRole("complementary").getByText(/編集前の文面/u)).toBeVisible();
  await expect(page.getByRole("group", { name: "確認状況の内訳" })).toContainText(/編集済み\s*1/u);
});

test("要点に確かめが必要な文を、出典に根拠の内訳を表示し、食い違う出典があれば出典タブの数を赤くする", async ({
  page,
}) => {
  await page.goto("/#p=r2");
  const panel = page.getByRole("complementary");
  // 確認済みの文は出さず、確かめが必要な文だけを理由と並べる
  await expect(panel.getByText(/SSO の強制」を有効に/u)).toBeVisible();
  await expect(panel.getByText("社内FAQ で確認")).toHaveCount(0);
  // 取るべきアクションは返信の下部にまとめ、右側では繰り返さない
  await expect(panel.getByText("次のアクション")).toHaveCount(0);

  await page.getByLabel("段落 データの保存期間と削除").click();
  const sourcesTab = panel.getByRole("tab", { name: /出典/u });
  await expect(sourcesTab.locator(".tab-count")).toHaveClass(/is-alert/u);
  await sourcesTab.click();
  await expect(panel.getByText("支持 1・食い違い 1")).toBeVisible();

  await page.getByLabel("段落 エラー行があるときの取り込み").click();
  await expect(sourcesTab.locator(".tab-count")).not.toHaveClass(/is-alert/u);
  await sourcesTab.click();
  await expect(panel.getByText("支持 2")).toBeVisible();
});

test("画面の上に送る前にやることの残りを表示し、押すと一覧へ移動する。チェックした段落には「確認した」が付く", async ({
  page,
}) => {
  await page.goto("/");
  const remaining = page.getByRole("button", { name: /送る前にやること 残り 1 件/u });
  await expect(remaining).toBeVisible();
  await remaining.click();
  const actions = page.getByLabel("改善アクション");
  await expect(actions).toBeInViewport();

  const paragraph = page.getByLabel("段落 データの保存期間と削除");
  await expect(paragraph.getByText("確認した")).toHaveCount(0);
  await actions.getByRole("checkbox", { name: "データの保存期間と削除 を確認済みにする" }).check();
  await expect(paragraph.getByText("確認した")).toBeVisible();
  await expect(page.getByRole("button", { name: /送る前の確認 完了/u })).toBeVisible();
});

test("確認済みの段落を書き換えると、送る前にやることに「編集した内容を確かめる」が加わる", async ({
  page,
}) => {
  await page.goto("/");
  const text = page.getByLabel("段落 エラー行があるときの取り込み").locator(".paragraph-text");
  await text.click();
  await page.keyboard.press("End");
  await page.keyboard.type("（追記）");
  await page.getByRole("heading", { level: 1 }).click();

  const actions = page.getByLabel("改善アクション");
  await expect(actions.getByText("送る前にやること（2件）")).toBeVisible();
  await expect(actions.getByText("編集した内容を確かめる。")).toBeVisible();
  await expect(page.getByRole("button", { name: /送る前にやること 残り 2 件/u })).toBeVisible();
});

test("送る前にやることが残っているときは、返信プレビューに残りの件数を表示する", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "返信プレビュー" }).click();
  const dialog = page.getByRole("dialog", { name: "返信プレビュー" });
  await expect(dialog.getByRole("alert")).toContainText("送る前にやることが残り 1 件あります");
  await dialog.getByRole("button", { name: "閉じる" }).click();

  await page
    .getByLabel("改善アクション")
    .getByRole("checkbox", { name: "データの保存期間と削除 を確認済みにする" })
    .check();
  await page.getByRole("button", { name: "返信プレビュー" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
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
