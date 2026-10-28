/** E2E で共通に使う: Bot での登録と、Access でログインした人の JWT */
import { type Browser, type BrowserContext, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type StoredStubKey,
  accessClaims,
  importStubKey,
  signToken,
} from "../scripts/access-stub.ts";
import { JWT_HEADER } from "../src/access.ts";
import { type ReplyReviewPayload, encodePayload } from "@cre/editor-payload";
import { PORTS } from "./ports.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

/** .dev.vars.example の値（wrangler dev はこれで動いている） */
const devVars = Object.fromEntries(
  readFileSync(join(APP, ".dev.vars.example"), "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/u.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const access = JSON.parse(devVars.ACCESS!) as {
  allowedEmailDomains: string[];
  teamDomain: string;
  aud: string;
};

export const BASE_URL = devVars.BASE_URL!;
export const EDITOR_URL = devVars.EDITOR_URL!;
export const ORG_DOMAIN = access.allowedEmailDomains[0]!;

/** Bot の Worker から Service Binding で登録する（ガイド「短縮 URL を作る」） */
export const createShortUrl = async (data: string): Promise<{ id: string; url: string }> => {
  const response = await fetch(`http://localhost:${PORTS.bot}/`, { method: "POST", body: data });
  const body = (await response.json()) as { id: string; url: string; error?: string };
  expect(response.status, body.error).toBe(200);
  return body;
};

/** Bot での登録が断られることを確かめる */
export const createFails = async (data: string): Promise<string> => {
  const response = await fetch(`http://localhost:${PORTS.bot}/`, { method: "POST", body: data });
  expect(response.status).toBe(400);
  return ((await response.json()) as { error: string }).error;
};

/** scripts/dev-access.ts serve が作った鍵で、そのメールでログインした人の JWT を作る */
export const tokenFor = async (email: string): Promise<string> => {
  const stored = JSON.parse(readFileSync(join(APP, ".dev-access.json"), "utf8")) as StoredStubKey;
  return signToken(
    await importStubKey(stored),
    accessClaims({ iss: access.teamDomain, aud: access.aud, email }),
  );
};

/**
 * Access でログインしたあとのブラウザ。本番では Access が JWT をヘッダーに付けるので、ここではテストが付ける。
 * email を省くと、Access を通っていない（ログインしていない）ブラウザになる
 */
export const browserAs = async (browser: Browser, email?: string): Promise<BrowserContext> =>
  browser.newContext(email ? { extraHTTPHeaders: { [JWT_HEADER]: await tokenFor(email) } } : {});

/** 判定データ（Message Editor が表示できる最小の形）。件名でどのデータかを見分ける */
export const dataWithSubject = (subject: string): string => {
  const payload: ReplyReviewPayload = {
    version: 2,
    generatedAt: "2026-10-06T10:00:00+09:00",
    inquiry: {
      from: "田中 様",
      subject,
      receivedAt: "2026-10-05T09:00:00+09:00",
      paragraphs: [{ id: "q1", text: "問い合わせの本文" }],
    },
    reply: {
      to: "田中 様",
      subject: `Re: ${subject}`,
      paragraphs: [{ id: "r1", respondsTo: ["q1"], parts: [{ text: "返信の本文" }] }],
    },
  };
  return encodePayload(payload);
};
