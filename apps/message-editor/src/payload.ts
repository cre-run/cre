import { deflate, inflate } from "pako";
import type { ReplyReviewPayload } from "./types.ts";

/** URL ハッシュのキー（`#d=<base64url>`） */
export const HASH_KEY = "d";

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const fromBase64Url = (text: string): Uint8Array => {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** payload を pako で圧縮し、URL に載せられる文字列にする */
export const encodePayload = (payload: ReplyReviewPayload): string =>
  toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(payload))));

/** encodePayload の逆。形式が不正なら例外を投げる */
export const decodePayload = (encoded: string): ReplyReviewPayload => {
  const json = new TextDecoder().decode(inflate(fromBase64Url(encoded)));
  const data: unknown = JSON.parse(json);
  if (!isPayload(data)) {
    throw new Error("データの形式が正しくありません（version 1 の payload ではありません）");
  }
  return data;
};

/** `#d=...` 形式のハッシュから圧縮データを取り出す。なければ null */
export const readHash = (hash: string): string | null => {
  const params = new URLSearchParams(hash.replace(/^#/u, ""));
  return params.get(HASH_KEY);
};

export const toHash = (payload: ReplyReviewPayload): string =>
  `#${HASH_KEY}=${encodePayload(payload)}`;

const isPayload = (data: unknown): data is ReplyReviewPayload => {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const value = data as Partial<ReplyReviewPayload>;
  return (
    value.version === 1 &&
    typeof value.generatedAt === "string" &&
    Array.isArray(value.inquiry?.paragraphs) &&
    Array.isArray(value.reply?.paragraphs)
  );
};
