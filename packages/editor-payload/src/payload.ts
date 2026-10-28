import { Inflate, deflate } from "pako";
import type { ReplyReviewPayload } from "./types.ts";
import { isPayloadV1, upgradeV1 } from "./v1.ts";
import { isArrayOf, isEvidence, isObject, isPayloadOf, isString, isUnique } from "./validate.ts";

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
export const encodePayload = (payload: ReplyReviewPayload): string =>
  toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(payload))));

/** encodePayload の逆。version 1 のデータは version 2 の形にして返す。形式が不正なら例外を投げる */
export const decodePayload = (encoded: string): ReplyReviewPayload => {
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

export const toHash = (payload: ReplyReviewPayload): string =>
  `#${HASH_KEY}=${encodePayload(payload)}`;

type Shape = Record<string, unknown>;

const isGapOption = (v: unknown): v is Shape =>
  isObject(v) &&
  isString(v.label) &&
  (v.evidence === undefined || isArrayOf(v.evidence, isEvidence));

const isGap = (v: unknown): v is Shape =>
  isObject(v) &&
  isString(v.id) &&
  isString(v.question) &&
  (v.options === undefined || isArrayOf(v.options, isGapOption)) &&
  (v.owners === undefined || isArrayOf(v.owners, isString));

/** 文章（text）か書く必要のある箇所（gap）のどちらか一方だけを持つ */
const isPart = (v: unknown): v is Shape =>
  isObject(v) && ("gap" in v ? !("text" in v) && isGap(v.gap) : isString(v.text));

/** 本文は文章と書く必要のある箇所を並べたもの。書く必要のある箇所の ID は段落の中で重複させない */
const hasParts = (paragraph: Shape): boolean =>
  isArrayOf(paragraph.parts, isPart) &&
  isUnique(paragraph.parts.filter((part) => "gap" in part).map((part) => (part.gap as Shape).id));

/** version 2 の形かを確かめる。version 1 は parsePayload が変換してから渡す */
export const isPayload = (data: unknown): data is ReplyReviewPayload =>
  isPayloadOf(data, 2, hasParts);

/**
 * JSON から読んだ値を、画面が扱う version 2 の形にする。version 1 は upgradeV1 で変換する。
 * どちらの形でもなければ例外を投げる
 */
export const parsePayload = (data: unknown): ReplyReviewPayload => {
  if (isPayload(data)) {
    return data;
  }
  if (isPayloadV1(data)) {
    return upgradeV1(data);
  }
  throw new Error("データの形式が正しくありません（version 1・2 の payload ではありません）");
};
