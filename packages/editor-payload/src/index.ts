/**
 * Message Editor の判定データ（`ReplyReviewPayload`）の型と、URL の `#d=` に載せる
 * 圧縮・展開・検証。Message Editor（表示する側）と短縮 URL（登録時に検査する側）で共有する。
 */
export {
  HASH_KEY,
  MAX_DECODED_BYTES,
  MAX_ENCODED_LENGTH,
  decodePayload,
  encodePayload,
  isPayload,
  parsePayload,
  readHash,
  toHash,
} from "./payload.ts";
export { isPayloadV2 } from "./v2.ts";
export type {
  AnyReplyReviewPayload,
  CheckItem,
  CheckResult,
  Claim,
  Evidence,
  EvidenceStance,
  EvidenceType,
  Inquiry,
  InquiryParagraph,
  NextActionTiming,
  ParagraphStatus,
  Reply,
  ReplyMode,
  ReplyParagraph,
  ReplyReviewPayload,
} from "./types.ts";
export type {
  Assertion,
  AssertionStatus,
  Gap,
  GapOption,
  ReplyParagraphV2,
  ReplyPart,
  ReplyReviewPayloadV2,
  ReplyV2,
} from "./types-v2.ts";
