/**
 * version 2 の判定データ。段落ではなく **本文の一部（下線）** ごとに判定と根拠を持つ。
 * version 1（types.ts）とは別の画面で表示する（変換はしない）。
 *
 * - 段落の本文は parts で、文章（text）・判定した一部（assertion）・人が書く必要のある箇所（gap）を順に並べる
 * - 判定のない文章（あいさつなど）は text にし、画面は印を付けない
 * - 根拠が足りない箇所は、判定モデルが文章を作らずに gap にする。画面は空欄として表示し、書き起こしは人が行う
 * - 画面は読み取り専用（本文の編集はできない）
 */
import type {
  CheckItem,
  Evidence,
  Inquiry,
  NextActionTiming,
  ParagraphStatus,
  ReplyMode,
} from "./types.ts";

export interface ReplyReviewPayloadV2 {
  version: 2;
  /** 判定を行った日時（ISO 8601）。根拠の鮮度はこの日時を基準に計算する */
  generatedAt: string;
  /** 判定に使ったモデル（表示用） */
  model?: { name: string; version?: string };
  /** 作成モード。version 1 と同じ */
  mode?: ReplyMode;
  inquiry: Inquiry;
  reply: ReplyV2;
}

export interface ReplyV2 {
  to: string;
  subject: string;
  /** 宛名など、判定の対象外とする書き出し */
  opening?: string;
  /** 署名など、判定の対象外とする結び */
  closing?: string;
  paragraphs: ReplyParagraphV2[];
}

export interface ReplyParagraphV2 {
  id: string;
  /** どの問い合わせ段落への回答か */
  respondsTo: string[];
  /** 本文。文章・判定した一部・人が書く必要のある箇所を順に並べる */
  parts: ReplyPart[];
}

export type ReplyPart = { text: string } | { assertion: Assertion } | { gap: Gap };

/**
 * 判定した本文の一部の確認状況。根拠が見つからない箇所は Assertion にせず Gap にするので、
 * version 1 の unverified（根拠なし）はない
 */
export type AssertionStatus = Exclude<ParagraphStatus, "unverified">;

/** 判定した本文の一部（画面では下線を引く） */
export interface Assertion {
  /** 返信全体で一意な ID（Gap と合わせて重複させない） */
  id: string;
  /** 本文に書く文章 */
  text: string;
  status: AssertionStatus;
  /** 右パネルの見出し（例: 「SSO の強制が有効なときの手順」） */
  topic: string;
  /** 判定のひとこと */
  summary: string;
  /** 確認の方法（例: 「社内FAQ で確認」） */
  method?: string;
  /** この説明が成り立つ条件 */
  conditions?: string;
  /** 確認の内訳 */
  checks: CheckItem[];
  evidence: Evidence[];
  /** 送る前・送った後にすること。確認済み以外で、改善アクションに表示する */
  nextAction?: string;
  /** nextAction をいつ行うか。省略時は status で決める（recheck は送る前、conditional は送った後） */
  nextActionTiming?: NextActionTiming;
  /** 確認に関わる担当 */
  owners?: string[];
}

/**
 * 根拠が足りず、判定モデルが文章を作らなかった箇所。画面では空欄として表示する。
 * 何を決めればよいかと、根拠のある選択肢だけを示し、文章は人が書く。いつも「送る前にやること」に出る
 */
export interface Gap {
  /** 返信全体で一意な ID（Assertion と合わせて重複させない） */
  id: string;
  /** 決める必要があること（例: 「解約後に何日でデータを削除するか」） */
  question: string;
  /** 書き起こすときの案内（例: 「どちらかを確かめてから日数を書く」） */
  guidance?: string;
  /** 根拠のある選択肢。根拠がなければ省略する */
  options?: GapOption[];
  /** 判断する担当 */
  owners?: string[];
}

export interface GapOption {
  /** 選択肢の要約（例: 「30 日（利用規約 第 12 条）」） */
  label: string;
  evidence?: Evidence[];
}
