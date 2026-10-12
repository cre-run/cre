/**
 * HTTP（開く）と RPC（登録）の本体。cloudflare:workers に依存しないので Node の単体テストで確かめられる。
 * 画面の文言は apps/docs/docs/short-url/index.mdx「開けないとき」の表と合わせる。
 */
import { type FetchJwks, defaultFetchJwks, verifyAccess } from "./access.ts";
import { ConfigError, readConfig } from "./config.ts";
import type { Bindings } from "./env.ts";
import { UUID_V4, editorUrl, findLink, insertLink, shortUrl, validateData } from "./links.ts";

export const MESSAGES = {
  403: "このメールアドレスでは開けません",
  404: "このリンクは開けません",
  503: "短縮 URL の設定が終わっていません",
} as const;

export type PageStatus = keyof typeof MESSAGES;

/** すべての応答に付ける。キャッシュせず、転送先に Referer を渡さず、検索エンジンに載せない */
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

/** 固定の文言だけの HTML。UUID やリクエストの内容は埋め込まない */
export const page = (status: PageStatus): Response =>
  new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>短縮 URL</title></head><body><p>${MESSAGES[status]}</p></body></html>`,
    { status, headers: { ...BASE_HEADERS, "Content-Type": "text/html; charset=utf-8" } },
  );

export interface Deps {
  fetchJwks?: FetchJwks;
  now?: () => number;
}

/** `GET /id/{uuid}` → Access でログインした組織の人なら、Message Editor へ 302 */
export const handleRequest = async (
  request: Request,
  env: Bindings,
  deps: Deps = {},
): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { ...BASE_HEADERS, Allow: "GET, HEAD" } });
  }
  const match = /^\/id\/([^/]+)$/u.exec(new URL(request.url).pathname);
  if (!match) {
    return page(404);
  }
  let config;
  try {
    config = readConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return page(503);
    }
    throw error;
  }
  const decision = await verifyAccess(
    request,
    config.access,
    deps.fetchJwks ?? defaultFetchJwks,
    deps.now?.() ?? Date.now(),
  );
  if (!decision.ok) {
    return page(decision.status);
  }
  const id = match[1]!;
  if (!UUID_V4.test(id)) {
    return page(404);
  }
  const data = await findLink(env.DB, id);
  if (data === null) {
    return page(404);
  }
  return new Response(null, {
    status: 302,
    headers: { ...BASE_HEADERS, Location: editorUrl(config.editorUrl, data) },
  });
};

/** RPC `create(data)` の本体。検査に通らなければ例外（呼んだ Bot に届く） */
export const createLink = async (
  env: Bindings,
  data: unknown,
  now: number = Date.now(),
): Promise<{ id: string; url: string }> => {
  const config = readConfig(env);
  const id = await insertLink(env.DB, validateData(data), now);
  return { id, url: shortUrl(config.baseUrl, id) };
};
