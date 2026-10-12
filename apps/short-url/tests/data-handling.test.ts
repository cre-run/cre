/**
 * 対応ガイド: apps/docs/docs/short-url/data-handling.mdx
 * （設計: apps/short-url/README.md「データの扱い」）。ブラウザを使わず、コードの形で確かめる。
 * - 判定データは自組織の D1 に書くだけで、ほかには送らない（取りに行くのは Access の公開鍵だけ）
 * - D1 には #d= の値をそのまま残す（暗号化しない）
 * - 開けるのは、Access の JWT で組織のメールのドメインが確かめられた人だけ
 * - リンクのプレビューや検索エンジンに判定データが出ない（302 の前にログインが要り、noindex）
 * 約束のテストはこのファイルにだけ置く（ガイドのバッジと tests/guide-promises.test.ts が突き合わせる）。
 * 「ブラウザの履歴・URL を貼った先」の行はブラウザや外部サービスの振る舞いなのでテストしない。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { certsUrl, clearJwksCache, defaultFetchJwks } from "../src/access.ts";
import { createLink, handleRequest } from "../src/app.ts";
import { ACCESS, FakeDb, data, envWith, fetchJwks, request, stubKey, tokenFor } from "./helpers.ts";
import { jwksOf } from "../scripts/access-stub.ts";

const APP = join(fileURLToPath(import.meta.url), "../..");

beforeEach(() => clearJwksCache());
afterEach(() => vi.restoreAllMocks());

test("判定データは自組織の D1 に書くだけで、ほかには送らない（取りに行くのは Access の公開鍵だけ）", async () => {
  const outbound: { url: string; body: string | null }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    outbound.push({ url, body: (init?.body as string | null) ?? null });
    return Response.json(jwksOf(stubKey));
  });
  const db = new FakeDb();
  const { id } = await createLink(envWith(db), data);
  // 本物の fetch を使う経路（公開鍵の取得）で開く
  const response = await handleRequest(
    request(`/id/${id}`, await tokenFor("user@example.com")),
    envWith(db),
    {
      fetchJwks: defaultFetchJwks,
    },
  );
  expect(response.status).toBe(302);
  expect(outbound.map((call) => call.url)).toEqual([certsUrl(ACCESS.teamDomain)]);
  expect(outbound.every((call) => call.body === null)).toBe(true);
  // D1 以外への書き込みはない: 登録・読み出しの SQL は links テーブルだけ
  expect(db.queries.every((query) => /\bFROM links\b|\bINTO links\b/u.test(query))).toBe(true);
});

test("Worker のコードは、判定データを送信・保存する API を使っていない（fetch は Access の公開鍵の取得だけ）", () => {
  const files = readdirSync(join(APP, "src"), { recursive: true, encoding: "utf8" }).filter(
    (name) => name.endsWith(".ts"),
  );
  expect(files.length).toBeGreaterThan(3);
  for (const file of files) {
    const text = readFileSync(join(APP, "src", file), "utf8");
    const fetches = [...text.matchAll(/\bfetch\s*\(/gu)];
    expect(fetches.length, `${file}: fetch は access.ts の公開鍵の取得だけ`).toBe(
      file === "access.ts" ? 1 : 0,
    );
    expect(text, file).not.toMatch(
      /XMLHttpRequest|sendBeacon|WebSocket|caches\.open|console\.log\(/u,
    );
  }
});

test("D1 には #d= の値をそのまま残す（暗号化しない。管理者が消すまで残る）", async () => {
  const db = new FakeDb();
  const { id } = await createLink(envWith(db), data, 1_760_000_000_000);
  expect(db.rows.get(id)).toEqual({ data, created_at: 1_760_000_000 });
});

test("開けるのは、Access の JWT で組織のメールのドメインが確かめられた人だけ", async () => {
  const db = new FakeDb();
  const { id } = await createLink(envWith(db), data);
  const open = (token?: string) =>
    handleRequest(request(`/id/${id}`, token), envWith(db), { fetchJwks });
  expect((await open(await tokenFor("user@example.com"))).status).toBe(302);
  // JWT なし（Access がかかっていない）・組織の外・署名なしの偽物は、どれも判定データを返さない
  for (const token of [undefined, await tokenFor("user@other.com"), "forged.jwt.token"]) {
    const response = await open(token);
    expect(response.status, String(token)).not.toBe(302);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.text()).not.toContain(data);
  }
});

test("リンクのプレビューや検索エンジンに判定データが出ない（ログインの前は 302 せず、すべて noindex）", async () => {
  const db = new FakeDb();
  const { id } = await createLink(envWith(db), data);
  // 展開ボットは Access のログインを通らないので JWT を持たない
  const bot = await handleRequest(
    new Request(`https://short.example.com/id/${id}`, {
      headers: { "User-Agent": "Slackbot-LinkExpanding 1.0" },
    }),
    envWith(db),
    { fetchJwks },
  );
  expect(bot.status).toBe(503);
  expect(await bot.text()).not.toContain(data);
  for (const response of [
    bot,
    await handleRequest(request(`/id/${id}`, await tokenFor("user@example.com")), envWith(db), {
      fetchJwks,
    }),
  ]) {
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
});
