/**
 * Cloudflare Access の JWT を検証し、ログインした人のメールのドメインを確かめる。
 * 設計: apps/short-url/README.md「データの扱い」。Cloudflare の手順:
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 *
 * - ヘッダーは誰でも付けられるので、署名・iss・aud・exp を必ず確かめる
 * - `Cf-Access-Authenticated-User-Email` は署名がないので使わない。メールは JWT の中からだけ読む
 * - 依存を足さず Web Crypto だけで検証する（Workers と Node のどちらでも動く）
 */
import type { AccessConfig } from "./config.ts";

export const JWT_HEADER = "Cf-Access-Jwt-Assertion";

export interface Jwk extends JsonWebKey {
  kid?: string;
}

export type FetchJwks = (url: string) => Promise<{ keys: Jwk[] }>;

export type AccessDecision =
  /** 組織のメールアドレスでログインしている */
  | { ok: true; email: string }
  /** 403: JWT が正しくない・ドメインが許可されていない。503: Access を通っていない（JWT がない）・公開鍵を取れない */
  | { ok: false; status: 403 | 503 };

/** 公開鍵の取得先（Access のチームの origin + 固定のパス） */
export const certsUrl = (teamDomain: string): string => `${teamDomain}/cdn-cgi/access/certs`;

export const defaultFetchJwks: FetchJwks = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`certs: HTTP ${response.status}`);
  }
  return (await response.json()) as { keys: Jwk[] };
};

/** 公開鍵は短く持つ。Access は約 6 週間ごとに鍵を入れ替え、古い鍵も 7 日は有効 */
const JWKS_TTL_MS = 10 * 60 * 1000;
/** 知らない kid が来たときに取り直すまでの最短の間隔（鍵の入れ替え直後の対応。連打で取りに行かない） */
const JWKS_REFRESH_MIN_MS = 60 * 1000;
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();

const findKey = async (
  url: string,
  kid: string,
  fetchJwks: FetchJwks,
  now: number,
): Promise<Jwk | undefined> => {
  let cached = jwksCache.get(url);
  const stale = !cached || now - cached.at > JWKS_TTL_MS;
  const unknownKid = cached && !cached.keys.some((key) => key.kid === kid);
  if (stale || (unknownKid && now - cached!.at > JWKS_REFRESH_MIN_MS)) {
    cached = { at: now, keys: (await fetchJwks(url)).keys };
    jwksCache.set(url, cached);
  }
  return cached?.keys.find((key) => key.kid === kid);
};

/** テスト用: 取得した公開鍵を忘れる */
export const clearJwksCache = (): void => jwksCache.clear();

const fromBase64Url = (text: string): Uint8Array => {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const decodeJson = (segment: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(segment)));
  if (typeof value !== "object" || value === null) {
    throw new Error("not an object");
  }
  return value as Record<string, unknown>;
};

/** メールアドレスの `@` より後ろ（小文字）。`@` がなければ undefined */
export const emailDomain = (email: string): string | undefined => {
  const at = email.lastIndexOf("@");
  return at < 0 ? undefined : email.slice(at + 1).toLowerCase();
};

const verifySignature = async (
  jwk: Jwk,
  signed: string,
  signature: Uint8Array,
): Promise<boolean> => {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      new TextEncoder().encode(signed),
    );
  } catch {
    // RSA でない鍵や壊れた署名は「検証に失敗」として扱う（500 にしない）
    return false;
  }
};

/**
 * リクエストの JWT を検証する。
 * 失敗の理由は返さない（呼ぶ側は 403 / 503 の固定の画面にする）。判定データにもメールにも触れない。
 */
export const verifyAccess = async (
  request: Request,
  access: AccessConfig,
  fetchJwks: FetchJwks = defaultFetchJwks,
  now: number = Date.now(),
): Promise<AccessDecision> => {
  const token = request.headers.get(JWT_HEADER);
  if (!token) {
    return { ok: false, status: 503 };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: 403 };
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  let signature: Uint8Array;
  try {
    header = decodeJson(headerPart);
    payload = decodeJson(payloadPart);
    signature = fromBase64Url(signaturePart);
  } catch {
    return { ok: false, status: 403 };
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    return { ok: false, status: 403 };
  }

  let jwk: Jwk | undefined;
  try {
    jwk = await findKey(certsUrl(access.teamDomain), header.kid, fetchJwks, now);
  } catch {
    return { ok: false, status: 503 };
  }
  if (!jwk || !(await verifySignature(jwk, `${headerPart}.${payloadPart}`, signature))) {
    return { ok: false, status: 403 };
  }

  const seconds = Math.floor(now / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    payload.iss !== access.teamDomain ||
    !audiences.includes(access.aud) ||
    typeof payload.exp !== "number" ||
    payload.exp <= seconds ||
    (typeof payload.nbf === "number" && payload.nbf > seconds)
  ) {
    return { ok: false, status: 403 };
  }
  // サービストークンなど、人のログインでない JWT には email がない
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const domain = email === undefined ? undefined : emailDomain(email);
  if (email === undefined || domain === undefined || !access.allowedEmailDomains.includes(domain)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, email };
};
