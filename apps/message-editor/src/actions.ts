import type { NextActionTiming, ParagraphStatus, ReplyParagraph } from "@cre/editor-payload";

export interface ActionItem {
  paragraphId: string;
  /** 返信の何段落目か（1 始まり） */
  index: number;
  topic: string;
  status: ParagraphStatus;
  action: string;
  owners: string[];
}

export interface ActionGroups {
  /** 送る前に確認・修正すること（既定は再確認・根拠なし） */
  beforeSend: ActionItem[];
  /** 送った後にフォローすること（既定は条件あり：お客様の回答を待って案内するなど） */
  afterSend: ActionItem[];
}

/** nextActionTiming の指定がないときの欄 */
const DEFAULT_TIMING: Record<Exclude<ParagraphStatus, "verified">, NextActionTiming> = {
  unverified: "beforeSend",
  recheck: "beforeSend",
  conditional: "afterSend",
};

/** 欄の中の並び順。根拠なし → 再確認 → 条件あり */
const ORDER: ParagraphStatus[] = ["unverified", "recheck", "conditional"];

const FALLBACK: Record<ParagraphStatus, string> = {
  verified: "",
  conditional: "条件に当てはまるかをお客様に確認する。",
  recheck: "根拠を確認し直す。",
  unverified: "根拠を探して確認する。",
};

/**
 * 確認済み以外の段落から、取るべきアクションを「送る前／送った後」に分けて集める。
 * 欄は段落の nextActionTiming を優先し、なければ status で決める。
 */
export const collectActions = (paragraphs: ReplyParagraph[]): ActionGroups => {
  const groups: ActionGroups = { beforeSend: [], afterSend: [] };
  paragraphs.forEach((p, i) => {
    if (p.status === "verified") {
      return;
    }
    groups[p.nextActionTiming ?? DEFAULT_TIMING[p.status]].push({
      paragraphId: p.id,
      index: i + 1,
      topic: p.topic,
      status: p.status,
      action: p.nextAction ?? FALLBACK[p.status],
      owners: p.owners ?? [],
    });
  });
  // 状態の順に並べる（同じ状態の中は段落の順。sort は安定）
  const byStatus = (a: ActionItem, b: ActionItem) =>
    ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
  groups.beforeSend.sort(byStatus);
  groups.afterSend.sort(byStatus);
  return groups;
};
