/**
 * 画面描画に渡すデータ。初期は URL の `#d=` に pako で圧縮して載せる（バックエンドなし）。
 * 判定モデルの出力形式が固まるまでは、ここを唯一のスキーマとして扱う。
 */
/** 作成モード。`standard` は慎重な完成版、`flash` は速さ優先の速報 */
export type ReplyMode = "standard" | "flash";

export interface ReplyReviewPayload {
  version: 1;
  /** 判定を行った日時（ISO 8601）。根拠の鮮度はこの日時を基準に計算する */
  generatedAt: string;
  /** 判定に使ったモデル（表示用） */
  model?: { name: string; version?: string };
  /**
   * 作成モード。`flash`（速報）は速さを優先し、根拠の確認を省いた下書き。省略時は `standard`（完成版）。
   * 速報は全体の信頼性が低いので、画面は背景を警告色にし、上部に帯を出す
   */
  mode?: ReplyMode;
  inquiry: Inquiry;
  reply: Reply;
}

export interface Inquiry {
  /** 差出人（例: 「田中 様」） */
  from: string;
  subject: string;
  receivedAt: string;
  /** 問い合わせ本文を段落に分けたもの */
  paragraphs: InquiryParagraph[];
}

export interface InquiryParagraph {
  id: string;
  text: string;
}

export interface Reply {
  to: string;
  subject: string;
  /** 宛名など、判定の対象外とする書き出し */
  opening?: string;
  /** 署名など、判定の対象外とする結び */
  closing?: string;
  paragraphs: ReplyParagraph[];
}

export interface ReplyParagraph {
  id: string;
  /** 段落の要点（右パネルの見出し） */
  topic: string;
  text: string;
  /** どの問い合わせ段落への回答か */
  respondsTo: string[];
  status: ParagraphStatus;
  /** 確認の方法（例: 「一次情報で確認」） */
  method?: string;
  summary: string;
  /** 確認の内訳 */
  checks: CheckItem[];
  /** 回答が成り立つ条件（例: 対象プラン・機能） */
  conditions?: string;
  evidence: Evidence[];
  /**
   * 送る前・送った後にすること。確認済み以外の段落で、改善アクションに表示する。
   * どちらの欄に出すかは nextActionTiming で決まり、省略時は status で決まる（ParagraphStatus を参照）。
   */
  nextAction?: string;
  /**
   * nextAction をいつ行うか。省略時は status で決める（unverified・recheck は送る前、conditional は送った後）。
   * 条件ありでも送る前に担当へ確かめたい段落は "beforeSend" を指定する。
   */
  nextActionTiming?: NextActionTiming;
  /** 確認に関わる担当（例: 「開発担当」「CS担当」） */
  owners?: string[];
  /**
   * 段落の中の文ごとの判定。1 つの段落に確認済みの文と確かめが必要な文が混ざるときに使う。
   * 画面は確認済み以外の文に印を付ける。段落の確認状況・改善アクションは status で決まり、ここは影響しない。
   */
  claims?: Claim[];
}

export interface Claim {
  /** 段落の本文（text）の一部をそのまま書く。本文に見つからない文には印を付けない */
  text: string;
  status: ParagraphStatus;
  /** 判定の理由（例: 「お客様の設定は未確認」） */
  note?: string;
}

/**
 * - verified: 根拠が確認できている（改善アクションに出さない）
 * - conditional: 条件つきで成り立つ（条件の確認が必要）。既定では「送った後のフォロー」に出す
 * - recheck: 根拠が古い・食い違うなど、確認し直しが必要。既定では「送る前にやること」に出す
 * - unverified: 根拠が見つからない。既定では「送る前にやること」に出す
 *
 * 既定の欄は ReplyParagraph.nextActionTiming で変えられる。
 */
export type ParagraphStatus = "verified" | "conditional" | "recheck" | "unverified";

/** 次のアクションを行う時機。beforeSend: 送る前、afterSend: 送った後 */
export type NextActionTiming = "beforeSend" | "afterSend";

export interface CheckItem {
  label: string;
  result: CheckResult;
  note?: string;
}

export type CheckResult = "ok" | "warn" | "ng";

export interface Evidence {
  type: EvidenceType;
  /** 段落の主張に対する立場 */
  stance: EvidenceStance;
  title: string;
  /** 引用・要約 */
  excerpt?: string;
  /** 出典（URL・ドキュメント名・リポジトリのパスなど） */
  source?: string;
  /** 出典へのリンク。http(s) 以外の URL は payload ごと受け付けない */
  url?: string;
  /** 根拠を確認した日時（ISO 8601）。鮮度の表示に使う */
  checkedAt?: string;
}

export type EvidenceType =
  | "terms"
  | "internal-rule"
  | "precedent"
  | "case-law"
  | "code"
  | "faq"
  | "help";

export type EvidenceStance = "supports" | "conditional" | "contradicts" | "related";
