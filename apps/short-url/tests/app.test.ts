/**
 * 開く・登録の本体。画面の文言はガイド（apps/docs/docs/short-url/index.mdx「開けないとき」）と合わせる。
 * 約束（送らない・残る・開ける人）は tests/data-handling.test.ts で確かめる。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, expect, test } from "vite-plus/test";
import { clearJwksCache } from "../src/access.ts";
import { MESSAGES, createLink, handleRequest, page } from "../src/app.ts";
import { ConfigError } from "../src/config.ts";
import { InvalidDataError } from "../src/links.ts";
import {
  BASE_URL,
  EDITOR_URL,
  FakeDb,
  data,
  envWith,
  fetchJwks,
  request,
  tokenFor,
} from "./helpers.ts";

const GUIDE = join(fileURLToPath(import.meta.url), "../../../docs/docs/short-url/index.mdx");

beforeEach(() => clearJwksCache());

const open = (db: FakeDb, path: string, token?: string, overrides = {}) =>
  handleRequest(request(path, token), envWith(db, overrides), { fetchJwks });

test("登録すると短縮 URL が返り、開くと Message Editor へ転送される", async () => {
  const db = new FakeDb();
  const { id, url } = await createLink(envWith(db), data);
  expect(url).toBe(`${BASE_URL}/id/${id}`);

  const response = await open(db, `/id/${id}`, await tokenFor("user@example.com"));
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(`${EDITOR_URL}#d=${data}`);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
});

test("開けないときは、ガイドの表と同じ文言の固定の画面を返す（UUID は埋め込まない）", async () => {
  const db = new FakeDb();
  const token = await tokenFor("user@example.com");
  const missing = "0f8c3a52-6b1e-4d7a-9c25-3e4f5a6b7c8d";
  const cases: [Promise<Response>, 403 | 404 | 503][] = [
    [open(db, `/id/${missing}`, token), 404],
    [open(db, `/id/not-a-uuid`, token), 404],
    [open(db, `/`, token), 404],
    [open(db, `/${missing}`, token), 404],
    [open(db, `/id/${missing}`, await tokenFor("user@other.com")), 403],
    [open(db, `/id/${missing}`), 503],
    [open(db, `/id/${missing}`, token, { ACCESS: undefined }), 503],
  ];
  for (const [pending, status] of cases) {
    const response = await pending;
    expect(response.status).toBe(status);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Location")).toBeNull();
    const html = await response.text();
    expect(html).toContain(MESSAGES[status]);
    expect(html).not.toContain(missing);
    expect(html).toMatch(/<meta name="robots" content="noindex">/u);
  }
  expect(
    (await handleRequest(new Request(`${BASE_URL}/id/${missing}`, { method: "POST" }), envWith(db)))
      .status,
  ).toBe(405);
});

test("画面の文言はガイドの「開けないとき」の表にある", () => {
  const guide = readFileSync(GUIDE, "utf8");
  for (const message of Object.values(MESSAGES)) {
    expect(guide).toContain(`| ${message} `);
  }
});

test("登録は設定がそろい、データが正しいときだけ", async () => {
  const db = new FakeDb();
  await expect(createLink(envWith(db, { BASE_URL: undefined }), data)).rejects.toThrow(ConfigError);
  await expect(createLink(envWith(db), "not-a-payload")).rejects.toThrow(InvalidDataError);
  expect(db.rows.size).toBe(0);
});

test("page() は 3 種類の固定の画面だけを作る", async () => {
  for (const status of [403, 404, 503] as const) {
    const response = page(status);
    expect(response.status).toBe(status);
    expect(await response.text()).toContain(MESSAGES[status]);
  }
});
