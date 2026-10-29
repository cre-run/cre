/**
 * Message Editor の判定データ（`ReplyReviewPayload`）の型と、URL の `#d=` に載せる
 * 圧縮・展開・検証。Message Editor（表示する側）と短縮 URL（登録時に検査する側）で共有する。
 */
export {
  HASH_KEY,
  MAX_DECODED_BYTES,
  MAX_ENCODED_LENGTH,
  RETIRED_VERSIONS,
  RetiredVersionError,
  decodePayload,
  encodePayload,
  isPayload,
  parsePayload,
  readHash,
  toHash,
} from "./payload.ts";
export type {
  Assertion,
  AssertionStatus,
  CheckItem,
  CheckResult,
  Evidence,
  EvidenceStance,
  EvidenceType,
  Gap,
  GapOption,
  Inquiry,
  InquiryParagraph,
  NextActionTiming,
  Reply,
  ReplyMode,
  ReplyParagraph,
  ReplyPart,
  ReplyReviewPayload,
} from "./types.ts";
