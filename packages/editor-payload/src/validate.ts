/**
 * 判定データの検証。version 1 と 2 で共通の部分をここに置き、本文の形だけをそれぞれで確かめる。
 */
type Shape = Record<string, unknown>;

export const isObject = (value: unknown): value is Shape =>
  typeof value === "object" && value !== null;
export const isString = (value: unknown): value is string => typeof value === "string";
const isOptionalString = (value: unknown): boolean => value === undefined || isString(value);
/** 表示時に Date として扱う項目は、解釈できる日時文字列だけを受け付ける */
const isDate = (value: unknown): value is string =>
  isString(value) && !Number.isNaN(Date.parse(value));
/** 根拠のリンクは http(s) だけを受け付ける（`javascript:` や `data:` を href にしない） */
const isHttpUrl = (value: unknown): value is string => {
  if (!isString(value)) {
    return false;
  }
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
export const isArrayOf = <T>(value: unknown, item: (v: unknown) => v is T): value is T[] =>
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
const isNextActionTiming = oneOf("beforeSend", "afterSend");

const isInquiryParagraph = (v: unknown): v is Shape =>
  isObject(v) && isString(v.id) && isString(v.text);

const isCheck = (v: unknown): v is Shape =>
  isObject(v) && isString(v.label) && isCheckResult(v.result) && isOptionalString(v.note);

export const isEvidence = (v: unknown): v is Shape =>
  isObject(v) &&
  isEvidenceType(v.type) &&
  isStance(v.stance) &&
  isString(v.title) &&
  ["excerpt", "source"].every((key) => isOptionalString(v[key])) &&
  (v.url === undefined || isHttpUrl(v.url)) &&
  (v.checkedAt === undefined || isDate(v.checkedAt));

const isClaim = (v: unknown): v is Shape =>
  isObject(v) && isString(v.text) && isStatus(v.status) && isOptionalString(v.note);

/** 返信の段落のうち、本文（v1 の text・v2 の parts）以外の項目 */
const isReplyParagraphMeta = (v: Shape): boolean =>
  ["id", "topic", "summary"].every((key) => isString(v[key])) &&
  ["method", "conditions", "nextAction"].every((key) => isOptionalString(v[key])) &&
  isArrayOf(v.respondsTo, isString) &&
  isStatus(v.status) &&
  (v.nextActionTiming === undefined || isNextActionTiming(v.nextActionTiming)) &&
  isArrayOf(v.checks, isCheck) &&
  isArrayOf(v.evidence, isEvidence) &&
  (v.owners === undefined || isArrayOf(v.owners, isString)) &&
  (v.claims === undefined || isArrayOf(v.claims, isClaim));

export const isUnique = (ids: unknown[]): boolean => new Set(ids).size === ids.length;

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

/**
 * 指定した version の形かを確かめる。本文の形は hasBody で確かめる。
 * 画面が前提とする項目と値をすべて確かめる（欠けていれば見本データにフォールバックさせる）
 */
export const isPayloadOf = (
  data: unknown,
  version: number,
  hasBody: (paragraph: Shape) => boolean,
): boolean => {
  if (!isObject(data) || data.version !== version || !isDate(data.generatedAt)) {
    return false;
  }
  if (data.mode !== undefined && data.mode !== "standard" && data.mode !== "flash") {
    return false;
  }
  const isReplyParagraph = (v: unknown): v is Shape =>
    isObject(v) && isReplyParagraphMeta(v) && hasBody(v);
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
