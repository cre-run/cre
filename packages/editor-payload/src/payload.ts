import { Inflate, deflate } from "pako";
import type { AnyReplyReviewPayload, ReplyReviewPayload } from "./types.ts";
import { isPayloadV2 } from "./v2.ts";
import {
  type Shape,
  isArrayOf,
  isCheck,
  isEvidence,
  isNextActionTiming,
  isObject,
  isOptionalArrayOf,
  isOptionalString,
  isPayloadOf,
  isStatus,
  isString,
} from "./validate.ts";

/** URL ハッシュのキー（`#d=<base64url>`） */
export const HASH_KEY = "d";

/**
 * 受け付ける圧縮データの最大長（文字数）。見本データで約 3,700 文字。
 * deflate は 700 倍以上に展開できるので、上限がないと巨大な URL で開いたタブが固まる。
 */
export const MAX_ENCODED_LENGTH = 100_000;

/**
 * 展開後の JSON の最大バイト数。見本データで約 8 KB。
 * 圧縮後の長さだけでは展開爆弾を防げない（10 万文字の圧縮データが 70 MB 以上に展開できる）ので、
 * 展開しながら大きさを見て、超えた時点で打ち切る。
 */
export const MAX_DECODED_BYTES = 1_000_000;

const tooLarge = (limit: string): Error => new Error(`データが大きすぎます（${limit}まで）`);

/** 展開後の大きさを見ながら inflate し、上限を超えたら途中でやめる */
const inflateBounded = (bytes: Uint8Array): Uint8Array => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflater = new Inflate({ chunkSize: 16 * 1024 });
  inflater.onData = (chunk) => {
    total += chunk.length;
    if (total > MAX_DECODED_BYTES) {
      throw tooLarge(`展開後 ${MAX_DECODED_BYTES.toLocaleString("ja-JP")} バイト`);
    }
    chunks.push(chunk);
  };
  if (!inflater.push(bytes, true) || inflater.err) {
    throw new Error(inflater.msg || "データを展開できません");
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

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
export const encodePayload = (payload: AnyReplyReviewPayload): string =>
  toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(payload))));

/** encodePayload の逆。version 1 か 2 の判定データを返す。形式が不正なら例外を投げる */
export const decodePayload = (encoded: string): AnyReplyReviewPayload => {
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw tooLarge(`${MAX_ENCODED_LENGTH.toLocaleString("ja-JP")} 文字`);
  }
  const json = new TextDecoder().decode(inflateBounded(fromBase64Url(encoded)));
  return parsePayload(JSON.parse(json));
};

/** `#d=...` 形式のハッシュから圧縮データを取り出す。なければ null */
export const readHash = (hash: string): string | null => {
  const params = new URLSearchParams(hash.replace(/^#/u, ""));
  return params.get(HASH_KEY);
};

export const toHash = (payload: AnyReplyReviewPayload): string =>
  `#${HASH_KEY}=${encodePayload(payload)}`;

const isClaim = (v: unknown): v is Shape =>
  isObject(v) && isString(v.text) && isStatus(v.status) && isOptionalString(v.note);

/** version 1 の返信の段落（id・respondsTo は isPayloadOf が確かめる） */
const isReplyParagraphV1 = (v: Shape): boolean =>
  ["topic", "text", "summary"].every((key) => isString(v[key])) &&
  ["method", "conditions", "nextAction"].every((key) => isOptionalString(v[key])) &&
  isStatus(v.status) &&
  (v.nextActionTiming === undefined || isNextActionTiming(v.nextActionTiming)) &&
  isArrayOf(v.checks, isCheck) &&
  isArrayOf(v.evidence, isEvidence) &&
  isOptionalArrayOf(v.owners, isString) &&
  isOptionalArrayOf(v.claims, isClaim);

/** version 1 の形かを確かめる */
export const isPayload = (data: unknown): data is ReplyReviewPayload =>
  isPayloadOf(data, 1, isReplyParagraphV1);

/**
 * JSON から読んだ値が、画面が表示できる判定データ（version 1 か 2）かを確かめて返す。
 * version 1 と 2 は別の画面で表示するので、変換はしない。どちらでもなければ例外を投げる
 */
export const parsePayload = (data: unknown): AnyReplyReviewPayload => {
  if (isPayload(data) || isPayloadV2(data)) {
    return data;
  }
  throw new Error("データの形式が正しくありません（version 1・2 の payload ではありません）");
};
