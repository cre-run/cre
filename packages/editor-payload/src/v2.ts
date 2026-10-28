/**
 * version 2 の判定データの検証。共通の部分は validate.ts、型は types-v2.ts。
 */
import type { ReplyReviewPayloadV2 } from "./types-v2.ts";
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
  isString,
  isUnique,
  oneOf,
} from "./validate.ts";

const isAssertionStatus = oneOf("verified", "conditional", "recheck");

const isAssertion = (v: unknown): v is Shape =>
  isObject(v) &&
  ["id", "text", "topic", "summary"].every((key) => isString(v[key])) &&
  ["method", "conditions", "nextAction"].every((key) => isOptionalString(v[key])) &&
  isAssertionStatus(v.status) &&
  (v.nextActionTiming === undefined || isNextActionTiming(v.nextActionTiming)) &&
  isArrayOf(v.checks, isCheck) &&
  isArrayOf(v.evidence, isEvidence) &&
  isOptionalArrayOf(v.owners, isString);

const isGapOption = (v: unknown): v is Shape =>
  isObject(v) && isString(v.label) && isOptionalArrayOf(v.evidence, isEvidence);

const isGap = (v: unknown): v is Shape =>
  isObject(v) &&
  isString(v.id) &&
  isString(v.question) &&
  isOptionalString(v.guidance) &&
  isOptionalArrayOf(v.options, isGapOption) &&
  isOptionalArrayOf(v.owners, isString);

const KINDS = ["text", "assertion", "gap"] as const;

/** text・assertion・gap のどれか 1 つだけを持つ */
const isPart = (v: unknown): v is Shape => {
  if (!isObject(v)) {
    return false;
  }
  const kinds = KINDS.filter((kind) => kind in v);
  if (kinds.length !== 1) {
    return false;
  }
  return kinds[0] === "text"
    ? isString(v.text)
    : kinds[0] === "assertion"
      ? isAssertion(v.assertion)
      : isGap(v.gap);
};

const isReplyParagraphV2 = (v: Shape): boolean => isArrayOf(v.parts, isPart);

/** 下線と空欄の ID。画面で選ぶ・チェックを付ける対象なので、返信全体で重複させない */
const itemIds = (data: Shape): unknown[] =>
  ((data.reply as Shape).paragraphs as Shape[]).flatMap((p) =>
    (p.parts as Shape[]).flatMap((part) => {
      const item = (part.assertion ?? part.gap) as Shape | undefined;
      return item ? [item.id] : [];
    }),
  );

/** version 2 の形かを確かめる */
export const isPayloadV2 = (data: unknown): data is ReplyReviewPayloadV2 =>
  isPayloadOf(data, 2, isReplyParagraphV2) && isUnique(itemIds(data as Shape));
