/**
 * vars の検証。欠けている・形式が違うときは ConfigError を投げ、呼ぶ側が 503 にする（fail closed）。
 * 設計: apps/short-url/README.md「設定」。使う人向けの説明: apps/docs/docs/short-url/self-hosting.mdx
 */
import type { Bindings } from "./env.ts";

export const DEFAULT_EDITOR_URL = "https://editor.cre.run/";

export interface AccessConfig {
  /** 開けるメールアドレスのドメイン（小文字。`@` より後ろと完全一致で比べる） */
  allowedEmailDomains: string[];
  /** Access のチームの origin（例: https://example.cloudflareaccess.com）。JWT の iss と公開鍵の取得先 */
  teamDomain: string;
  /** Access のアプリケーションの AUD タグ。JWT の aud と比べる */
  aud: string;
}

export interface Config {
  /** 短縮 URL の origin。create() が返す URL に使う */
  baseUrl: string;
  /** 開いたあとに移る Message Editor の URL */
  editorUrl: string;
  access: AccessConfig;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https の URL。ローカル（localhost）だけ http も許す。`#` と `?` は含まない */
const parseUrl = (name: string, value: unknown, { originOnly }: { originOnly: boolean }): URL => {
  if (typeof value !== "string" || value === "") {
    throw new ConfigError(`${name} がありません`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} が URL ではありません`);
  }
  const localHttp = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new ConfigError(`${name} は https で始めてください`);
  }
  if (url.hash !== "" || url.search !== "" || value.includes("#")) {
    throw new ConfigError(`${name} に # や ? は含められません`);
  }
  if (originOnly && url.pathname !== "/") {
    throw new ConfigError(`${name} はドメインまでにしてください`);
  }
  return url;
};

const isDomain = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(value);

const parseAccess = (value: unknown): AccessConfig => {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new ConfigError("ACCESS が JSON ではありません");
    }
  }
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError("ACCESS がありません");
  }
  const { allowedEmailDomains, teamDomain, aud } = raw as Record<string, unknown>;
  if (
    !Array.isArray(allowedEmailDomains) ||
    allowedEmailDomains.length === 0 ||
    !allowedEmailDomains.every(isDomain)
  ) {
    throw new ConfigError("ACCESS.allowedEmailDomains にメールのドメインを 1 つ以上書いてください");
  }
  if (typeof aud !== "string" || aud === "") {
    throw new ConfigError("ACCESS.aud がありません");
  }
  return {
    allowedEmailDomains: allowedEmailDomains.map((domain) => domain.toLowerCase()),
    teamDomain: parseUrl("ACCESS.teamDomain", teamDomain, { originOnly: true }).origin,
    aud,
  };
};

/** vars を読んで検証する。どれかが欠けていれば ConfigError */
export const readConfig = (env: Bindings): Config => ({
  baseUrl: parseUrl("BASE_URL", env.BASE_URL, { originOnly: true }).origin,
  editorUrl: parseUrl("EDITOR_URL", env.EDITOR_URL ?? DEFAULT_EDITOR_URL, { originOnly: false })
    .href,
  access: parseAccess(env.ACCESS),
});
