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
  readHash,
  toHash,
} from "./payload.ts";
export type {
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
