import type { NextActionTiming, ParagraphStatus, ReplyParagraph } from "@cre/editor-payload";

export interface ActionItem {
  /** チェックと「見る」の対象の ID（段落ごとの画面では段落、下線ごとの画面では下線・空欄） */
  id: string;
  /** 返信の何段落目か（1 始まり） */
  index: number;
  topic: string;
  /** gap は下線ごとの画面の空欄（要記入） */
  status: ParagraphStatus | "gap";
  /** 本文を書き換えた段落か（判定は編集前の文面に対するもの） */
  edited: boolean;
  action: string;
  owners: string[];
}

export interface ActionGroups {
  /** 送る前に確認・修正すること（既定は再確認・根拠なし・書き換えた確認済み） */
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

/** 欄の中の並び順。根拠なし → 再確認 → 条件あり → 書き換えた確認済み */
const ORDER: ActionItem["status"][] = ["unverified", "recheck", "conditional", "verified"];

const FALLBACK: Record<ParagraphStatus, string> = {
  verified: "",
  conditional: "条件に当てはまるかをお客様に確認する。",
  recheck: "根拠を確認し直す。",
  unverified: "根拠を探して確認する。",
};

/** 書き換えた確認済みの段落で取るアクション */
export const EDITED_ACTION = "編集した内容を確かめる。";

/**
 * 段落から、取るべきアクションを「送る前／送った後」に分けて集める。
 * 確認済みの段落は、本文を書き換えたとき（editedIds に含まれるとき）だけ送る前に入れる。
 * それ以外の欄は段落の nextActionTiming を優先し、なければ status で決める。
 */
export const collectActions = (
  paragraphs: ReplyParagraph[],
  editedIds: ReadonlySet<string> = new Set(),
): ActionGroups => {
  const groups: ActionGroups = { beforeSend: [], afterSend: [] };
  paragraphs.forEach((p, i) => {
    const edited = editedIds.has(p.id);
    const base = { id: p.id, index: i + 1, topic: p.topic, status: p.status, edited };
    if (p.status === "verified") {
      if (edited) {
        groups.beforeSend.push({ ...base, action: EDITED_ACTION, owners: [] });
      }
      return;
    }
    groups[p.nextActionTiming ?? DEFAULT_TIMING[p.status]].push({
      ...base,
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

/** 送る前にやることのうち、まだチェックしていない件数 */
export const remainingBeforeSend = (groups: ActionGroups, done: ReadonlySet<string>): number =>
  groups.beforeSend.filter((item) => !done.has(item.id)).length;
