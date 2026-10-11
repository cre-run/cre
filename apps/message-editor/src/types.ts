/**
 * 画面描画に渡すデータ。初期は URL の `#d=` に pako で圧縮して載せる（バックエンドなし）。
 * 判定モデルの出力形式が固まるまでは、ここを唯一のスキーマとして扱う。
 */
export interface ReplyReviewPayload {
  version: 1;
  /** 判定を行った日時（ISO 8601）。根拠の鮮度はこの日時を基準に計算する */
  generatedAt: string;
  /** 判定に使ったモデル（表示用） */
  model?: { name: string; version?: string };
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
  /** 送る前・送った後にすること */
  nextAction?: string;
  /** 確認に関わる担当（例: 「開発担当」「CS担当」） */
  owners?: string[];
}

/**
 * - verified: 根拠が確認できている
 * - conditional: 条件つきで成り立つ（条件の確認が必要）
 * - recheck: 根拠が古い・食い違うなど、確認し直しが必要
 * - unverified: 根拠が見つからない
 */
export type ParagraphStatus = "verified" | "conditional" | "recheck" | "unverified";

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
