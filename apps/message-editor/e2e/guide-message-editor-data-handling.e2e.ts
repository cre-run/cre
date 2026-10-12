/**
 * 対応ガイド: apps/docs/docs/message-editor/data-handling.mdx
 * （apps/docs/docs/message-editor/index.mdx「判定データの扱いについて」の詳細）
 *
 * ガイドの表「どこに届き、どこに届かないか」と「受け付けないデータ」の各行を、実際のブラウザで確かめる。
 * 約束のテストはこのファイルと tests/data-handling.test.ts にだけ置く（tested バッジと guide-promises.test.ts が突き合わせる）。
 * 「ブラウザの履歴・ブックマーク」「チャットに貼った URL」の行と、コピーした文面が画面を閉じた後も残ることはテストしない（ブラウザ・OS・外部サービスの振る舞い）。
 * 画像は撮らない（見た目ではなく、通信と保存の有無を見る）。
 */
import { type Page, expect, test } from "@playwright/test";
import { MAX_DECODED_BYTES, MAX_ENCODED_LENGTH, toHash } from "@cre/editor-payload";
import { samplePayload } from "../src/sample.ts";

/** 外部に出ていないことを探すための目印（圧縮前の JSON にだけ現れる） */
const MARK = "機密テスト-7f3a";
const EVIDENCE_URL = "https://example.com/terms";

const [first, ...rest] = samplePayload.reply.paragraphs;
const payload = {
  ...samplePayload,
  inquiry: { ...samplePayload.inquiry, subject: `${MARK} の件名` },
  reply: {
    ...samplePayload.reply,
    paragraphs: [
      {
        ...first!,
        evidence: [{ ...first!.evidence[0]!, url: EVIDENCE_URL, source: "利用規約 第3条" }],
      },
      ...rest,
    ],
  },
};

/** ガイドの手順を一通り行う: 段落を選ぶ・本文を編集する・チェックを付ける・プレビューを開く */
const operate = async (page: Page): Promise<void> => {
  await page.getByLabel("段落 データの保存期間と削除").click();
  const paragraph = page.locator(".paragraph-text").first();
  await paragraph.fill("編集した本文");
  await paragraph.blur();
  await page
    .getByLabel("改善アクション")
    .getByRole("checkbox", { name: "データの保存期間と削除 を確認済みにする" })
    .check();
  await page.getByRole("button", { name: "返信プレビュー" }).click();
  await expect(page.getByRole("dialog", { name: "返信プレビュー" })).toBeVisible();
  await page.getByRole("button", { name: "閉じる" }).click();
};

test("判定データは、画面を操作しても自分のオリジン以外に送られない", async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  const hash = toHash(payload);
  await page.goto(`/${hash}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${MARK} の件名`);
  await operate(page);

  // 通信はすべて自分のオリジンへの静的ファイルの取得で、判定データは含まない
  const origin = new URL(baseURL!).origin;
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    expect(url.startsWith(`${origin}/`), url).toBe(true);
    expect(url, url).not.toContain("#");
    expect(url, url).not.toContain(hash.slice(3, 64));
    expect(url, url).not.toContain(encodeURIComponent(MARK));
  }
});

test("判定データは、画面を操作してもブラウザに保存されない", async ({ page }) => {
  await page.goto(`/${toHash(payload)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${MARK} の件名`);
  await operate(page);

  // ブラウザには何も保存していない（履歴とブックマーク以外）
  const stored = await page.evaluate(async () => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    cookie: document.cookie,
    databases: (await indexedDB.databases()).map((db) => db.name),
    caches: await caches.keys(),
  }));
  expect(stored).toEqual({
    localStorage: 0,
    sessionStorage: 0,
    cookie: "",
    databases: [],
    caches: [],
  });
});

test("根拠のリンクは新しいタブで開き、開いた先に判定データの URL も window.opener も渡さない", async ({
  page,
  context,
}) => {
  const referers: (string | undefined)[] = [];
  await context.route(`${EVIDENCE_URL}**`, async (route) => {
    referers.push(route.request().headers()["referer"]);
    await route.fulfill({ contentType: "text/html", body: "<html><body>規約</body></html>" });
  });

  await page.goto(`/${toHash(payload)}`);
  const panel = page.getByRole("complementary");
  await panel.getByRole("tab", { name: /出典/u }).click();
  await panel.getByRole("button", { name: "根拠の詳細" }).first().click();
  const link = panel.getByRole("link", { name: "利用規約 第3条" });
  await expect(link).toHaveAttribute("href", EVIDENCE_URL);
  await expect(link).toHaveAttribute("rel", "noreferrer");

  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toBe(EVIDENCE_URL);
  expect(referers).toEqual([undefined]);
  expect(
    await popup.evaluate(() => ({ opener: window.opener, referrer: document.referrer })),
  ).toEqual({ opener: null, referrer: "" });
});

test("http(s) 以外のリンクを含むデータは読み込まず、見本データとエラーを表示する", async ({
  page,
}) => {
  const unsafe = {
    ...payload,
    reply: {
      ...payload.reply,
      paragraphs: [
        { ...first!, evidence: [{ ...first!.evidence[0]!, url: "javascript:alert(1)" }] },
        ...rest,
      ],
    },
  };
  await page.goto(`/${toHash(unsafe)}`);
  await expect(page.getByText("URL のデータを読み込めませんでした")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test("大きすぎるデータは展開せずにエラーを表示する", async ({ page }) => {
  await page.goto(`/#d=${"A".repeat(MAX_ENCODED_LENGTH + 1)}`);
  await expect(page.getByText("データが大きすぎます")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
});

test("展開すると大きくなるデータ（展開爆弾）は、途中で打ち切ってエラーを表示する", async ({
  page,
}) => {
  const bomb = {
    ...samplePayload,
    inquiry: { ...samplePayload.inquiry, subject: "a".repeat(MAX_DECODED_BYTES * 50) },
  };
  await page.goto(`/${toHash(bomb)}`);
  await expect(page.getByText("データが大きすぎます（展開後")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
});

test("壊れた判定データでは見本データとエラーを表示する", async ({ page }) => {
  await page.goto("/#d=broken");
  await expect(page.getByText("URL のデータを読み込めませんでした")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(samplePayload.inquiry.subject);
});

test("クリップボードには、コピーボタンを押したときだけ送る文面が入り、注釈や件名は入らない", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/${toHash(payload)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${MARK} の件名`);
  await page.evaluate(() => navigator.clipboard.writeText("コピー前"));
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  // ガイドの手順を一通り行っても、コピーボタンを押さなければクリップボードは変わらない
  await operate(page);
  expect(await clipboard()).toBe("コピー前");

  await page.getByRole("button", { name: "返信プレビュー" }).click();
  const dialog = page.getByRole("dialog", { name: "返信プレビュー" });
  await dialog.getByRole("button", { name: "本文をコピー" }).click();
  await expect(dialog.getByRole("button", { name: "コピーしました" })).toBeVisible();

  // 段落の間は空行。宛名・編集した本文・結びだけで、確認状況や件名（判定データの目印）は入らない
  const copied = await clipboard();
  expect(copied.startsWith(`${samplePayload.reply.opening}\n\n編集した本文\n\n`)).toBe(true);
  expect(copied.endsWith(`\n\n${samplePayload.reply.closing}`)).toBe(true);
  expect(copied).not.toContain(MARK);
  expect(copied).not.toContain("確認済み");
});
