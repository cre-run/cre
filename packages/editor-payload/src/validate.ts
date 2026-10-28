/**
 * 判定データの検証のうち、version 1 と 2 で共通の部分。
 * 返信の段落の形はそれぞれ（payload.ts の v1・v2.ts の v2）で確かめる。
 */
export type Shape = Record<string, unknown>;

export const isObject = (value: unknown): value is Shape =>
  typeof value === "object" && value !== null;
export const isString = (value: unknown): value is string => typeof value === "string";
export const isOptionalString = (value: unknown): boolean => value === undefined || isString(value);
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
export const isOptionalArrayOf = <T>(value: unknown, item: (v: unknown) => v is T): boolean =>
  value === undefined || isArrayOf(value, item);
export const oneOf =
  <T extends string>(...values: T[]) =>
  (value: unknown): value is T =>
    values.includes(value as T);

export const isStatus = oneOf("verified", "conditional", "recheck", "unverified");
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
export const isNextActionTiming = oneOf("beforeSend", "afterSend");

const isInquiryParagraph = (v: unknown): v is Shape =>
  isObject(v) && isString(v.id) && isString(v.text);

export const isCheck = (v: unknown): v is Shape =>
  isObject(v) && isString(v.label) && isCheckResult(v.result) && isOptionalString(v.note);

export const isEvidence = (v: unknown): v is Shape =>
  isObject(v) &&
  isEvidenceType(v.type) &&
  isStance(v.stance) &&
  isString(v.title) &&
  ["excerpt", "source"].every((key) => isOptionalString(v[key])) &&
  (v.url === undefined || isHttpUrl(v.url)) &&
  (v.checkedAt === undefined || isDate(v.checkedAt));

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
 * 指定した version の形かを確かめる（返信の段落は isReplyParagraph で確かめる）。
 * 画面が前提とする項目と値をすべて確かめる（欠けていれば見本データにフォールバックさせる）
 */
export const isPayloadOf = (
  data: unknown,
  version: number,
  isReplyParagraph: (paragraph: Shape) => boolean,
): boolean => {
  if (!isObject(data) || data.version !== version || !isDate(data.generatedAt)) {
    return false;
  }
  if (data.mode !== undefined && data.mode !== "standard" && data.mode !== "flash") {
    return false;
  }
  const isParagraph = (v: unknown): v is Shape =>
    isObject(v) && isString(v.id) && isArrayOf(v.respondsTo, isString) && isReplyParagraph(v);
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
    isArrayOf(reply.paragraphs, isParagraph) &&
    hasConsistentIds(inquiry.paragraphs, reply.paragraphs)
  );
};
