import { beforeEach, expect, test } from "vite-plus/test";
import { createStubKey, jwksOf, signToken } from "../scripts/access-stub.ts";
import { certsUrl, clearJwksCache, emailDomain, verifyAccess } from "../src/access.ts";
import { ACCESS, AUD, TEAM_DOMAIN, fetchJwks, request, stubKey, tokenFor } from "./helpers.ts";

beforeEach(() => clearJwksCache());

const verify = (token?: string, now?: number) =>
  verifyAccess(request("/id/x", token), ACCESS, fetchJwks, now);

test("組織のメールアドレスでログインした JWT を受け付ける", async () => {
  expect(await verify(await tokenFor("user@example.com"))).toEqual({
    ok: true,
    email: "user@example.com",
  });
  // ドメインの大文字小文字は区別しない。aud が文字列でもよい
  expect((await verify(await tokenFor("User@EXAMPLE.com", { aud: AUD }))).ok).toBe(true);
});

test("JWT がなければ 503（Access がかかっていない）", async () => {
  expect(await verify()).toEqual({ ok: false, status: 503 });
});

test("署名が合わない JWT は 403（ヘッダーは誰でも付けられる）", async () => {
  const other = await createStubKey("test-key");
  const forged = await signToken(other, {
    iss: TEAM_DOMAIN,
    aud: [AUD],
    email: "user@example.com",
    exp: 9e9,
  });
  expect(await verify(forged)).toEqual({ ok: false, status: 403 });
  expect(await verify("not.a.jwt")).toEqual({ ok: false, status: 403 });
  expect(await verify("a.b")).toEqual({ ok: false, status: 403 });
  // alg を none にしても通らない
  const none = await signToken(
    stubKey,
    { iss: TEAM_DOMAIN, aud: [AUD], email: "user@example.com", exp: 9e9 },
    { alg: "none" },
  );
  expect(await verify(none)).toEqual({ ok: false, status: 403 });
});

test("iss・aud・exp・nbf が合わない JWT は 403", async () => {
  const now = Date.now();
  for (const claims of [
    { iss: "https://other.cloudflareaccess.com" },
    { aud: ["other-aud"] },
    { exp: Math.floor(now / 1000) - 1 },
    { exp: "later" },
    { nbf: Math.floor(now / 1000) + 60 },
  ]) {
    expect(
      await verify(await tokenFor("user@example.com", claims), now),
      JSON.stringify(claims),
    ).toEqual({
      ok: false,
      status: 403,
    });
  }
});

test("許可していないドメイン・email のない JWT（サービストークンなど）は 403", async () => {
  for (const email of [
    "user@other.com",
    "user@sub.example.com",
    "user@example.com.evil.com",
    "example.com",
  ]) {
    expect(await verify(await tokenFor(email)), email).toEqual({ ok: false, status: 403 });
  }
  const serviceToken = await signToken(stubKey, {
    iss: TEAM_DOMAIN,
    aud: [AUD],
    common_name: "bot",
    exp: 9e9,
  });
  expect(await verify(serviceToken)).toEqual({ ok: false, status: 403 });
});

test("公開鍵は teamDomain の certs から取り、知らない kid は取り直す", async () => {
  const calls: string[] = [];
  const rotated = await createStubKey("rotated");
  let keys = jwksOf(stubKey);
  const fetcher = async (url: string) => {
    calls.push(url);
    return keys;
  };
  const token = await tokenFor("user@example.com");
  const now = Date.now();
  expect((await verifyAccess(request("/id/x", token), ACCESS, fetcher, now)).ok).toBe(true);
  expect((await verifyAccess(request("/id/x", token), ACCESS, fetcher, now + 1000)).ok).toBe(true);
  expect(calls).toEqual([certsUrl(TEAM_DOMAIN)]);

  // 鍵が入れ替わった: 新しい kid の JWT が来たら取り直す（ただし 1 分は待つ）
  keys = { keys: [...jwksOf(stubKey).keys, ...jwksOf(rotated).keys] };
  const newToken = await signToken(rotated, {
    iss: TEAM_DOMAIN,
    aud: [AUD],
    email: "user@example.com",
    exp: 9e9,
  });
  expect((await verifyAccess(request("/id/x", newToken), ACCESS, fetcher, now + 1000)).ok).toBe(
    false,
  );
  expect((await verifyAccess(request("/id/x", newToken), ACCESS, fetcher, now + 61_000)).ok).toBe(
    true,
  );
  expect(calls).toHaveLength(2);
});

test("公開鍵を取れなければ 503", async () => {
  const failing = async () => {
    throw new Error("certs: HTTP 500");
  };
  expect(
    await verifyAccess(request("/id/x", await tokenFor("user@example.com")), ACCESS, failing),
  ).toEqual({
    ok: false,
    status: 503,
  });
});

test("メールのドメインは最後の @ より後ろ", () => {
  expect(emailDomain("user@example.com")).toBe("example.com");
  expect(emailDomain("a@b@Example.COM")).toBe("example.com");
  expect(emailDomain("no-at")).toBeUndefined();
});
