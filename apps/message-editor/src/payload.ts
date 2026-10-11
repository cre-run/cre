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

type Shape = Record<string, unknown>;

const isObject = (value: unknown): value is Shape => typeof value === "object" && value !== null;
const isString = (value: unknown): value is string => typeof value === "string";
const isOptionalString = (value: unknown): boolean => value === undefined || isString(value);
/** 表示時に Date として扱う項目は、解釈できる日時文字列だけを受け付ける */
const isDate = (value: unknown): value is string =>
  isString(value) && !Number.isNaN(Date.parse(value));
const isArrayOf = <T>(value: unknown, item: (v: unknown) => v is T): value is T[] =>
  Array.isArray(value) && value.every(item);
const oneOf =
  <T extends string>(...values: T[]) =>
  (value: unknown): value is T =>
    values.includes(value as T);

const isStatus = oneOf("verified", "conditional", "recheck", "unverified");
const isCheckResult = oneOf("ok", "warn", "ng");
const isEvidenceType = oneOf(
  "terms",
  "internal-rule",
  "precedent",
  "case-law",
  "code",
  "faq",
  "help",
);
const isStance = oneOf("supports", "conditional", "contradicts", "related");

const isInquiryParagraph = (v: unknown): v is Shape =>
  isObject(v) && isString(v.id) && isString(v.text);

const isCheck = (v: unknown): v is Shape =>
  isObject(v) && isString(v.label) && isCheckResult(v.result) && isOptionalString(v.note);

const isEvidence = (v: unknown): v is Shape =>
  isObject(v) &&
  isEvidenceType(v.type) &&
  isStance(v.stance) &&
  isString(v.title) &&
  ["excerpt", "source", "url"].every((key) => isOptionalString(v[key])) &&
  (v.checkedAt === undefined || isDate(v.checkedAt));

const isReplyParagraph = (v: unknown): v is Shape =>
  isObject(v) &&
  ["id", "topic", "text", "summary"].every((key) => isString(v[key])) &&
  ["method", "conditions", "nextAction"].every((key) => isOptionalString(v[key])) &&
  isArrayOf(v.respondsTo, isString) &&
  isStatus(v.status) &&
  isArrayOf(v.checks, isCheck) &&
  isArrayOf(v.evidence, isEvidence) &&
  (v.owners === undefined || isArrayOf(v.owners, isString));

const isUnique = (ids: unknown[]): boolean => new Set(ids).size === ids.length;

/**
 * 段落 ID は選択・編集内容・React の key に使うため重複させない。
 * respondsTo は問い合わせの段落を指すので、存在する ID だけを許す。
 */
const hasConsistentIds = (inquiry: Shape[], reply: Shape[]): boolean => {
  const inquiryIds = inquiry.map((p) => p.id);
  const known = new Set(inquiryIds);
  return (
    isUnique(inquiryIds) &&
    isUnique(reply.map((p) => p.id)) &&
    reply.every((p) => (p.respondsTo as string[]).every((id) => known.has(id)))
  );
};

/** 画面が前提とする項目と値をすべて確かめる（欠けていれば見本データにフォールバックさせる） */
export const isPayload = (data: unknown): data is ReplyReviewPayload => {
  if (!isObject(data) || data.version !== 1 || !isDate(data.generatedAt)) {
    return false;
  }
  const { inquiry, reply } = data;
  return (
    isObject(inquiry) &&
    isString(inquiry.from) &&
    isString(inquiry.subject) &&
    isDate(inquiry.receivedAt) &&
    isArrayOf(inquiry.paragraphs, isInquiryParagraph) &&
    isObject(reply) &&
    isString(reply.to) &&
    isString(reply.subject) &&
    isOptionalString(reply.opening) &&
    isOptionalString(reply.closing) &&
    isArrayOf(reply.paragraphs, isReplyParagraph) &&
    hasConsistentIds(inquiry.paragraphs, reply.paragraphs)
  );
};
