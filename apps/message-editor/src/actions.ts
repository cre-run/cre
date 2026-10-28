import type { AssertionStatus, NextActionTiming } from "@cre/editor-payload";
import type { ItemStatus, ReplyItem } from "./reader.ts";

export interface ActionItem {
  /** チェックと「箇所を見る」の対象（下線・空欄）の ID */
  id: string;
  /** 箇所を含む段落が、返信の何段落目か（1 始まり） */
  index: number;
  /** 下線の見出し、または空欄で決める必要があること */
  topic: string;
  status: Exclude<ItemStatus, "verified">;
  action: string;
  owners: string[];
}

export interface ActionGroups {
  /** 送る前に確認・書き起こすこと（要記入の空欄・再確認の下線） */
  beforeSend: ActionItem[];
  /** 送った後にフォローすること（条件ありの下線：お客様の回答を待って案内するなど） */
  afterSend: ActionItem[];
}

const DEFAULT_TIMING: Record<Exclude<AssertionStatus, "verified">, NextActionTiming> = {
  recheck: "beforeSend",
  conditional: "afterSend",
};

const FALLBACK: Record<Exclude<AssertionStatus, "verified">, string> = {
  conditional: "条件に当てはまるかをお客様に確認する。",
  recheck: "根拠を確認し直す。",
};

/** 欄の中の並び順。要記入 → 再確認 → 条件あり */
const ORDER: ActionItem["status"][] = ["gap", "recheck", "conditional"];

/**
 * 下線と空欄から、取るべきアクションを「送る前／送った後」に分けて集める。
 * 空欄はいつも送る前。下線は nextActionTiming を優先し、なければ確認状況で決める。確認済みの下線は出さない
 */
export const collectActions = (items: ReplyItem[]): ActionGroups => {
  const groups: ActionGroups = { beforeSend: [], afterSend: [] };
  for (const item of items) {
    const base = { id: item.id, index: item.paragraphIndex };
    if (item.kind === "gap") {
      groups.beforeSend.push({
        ...base,
        status: "gap",
        topic: item.gap.question,
        action: item.gap.guidance ?? "確かめて、空欄を書き起こす。",
        owners: item.gap.owners ?? [],
      });
      continue;
    }
    const { assertion } = item;
    if (assertion.status === "verified") {
      continue;
    }
    groups[assertion.nextActionTiming ?? DEFAULT_TIMING[assertion.status]].push({
      ...base,
      status: assertion.status,
      topic: assertion.topic,
      action: assertion.nextAction ?? FALLBACK[assertion.status],
      owners: assertion.owners ?? [],
    });
  }
  // 状態の順に並べる（同じ状態の中は本文の順。sort は安定）
  const byStatus = (a: ActionItem, b: ActionItem) =>
    ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
  groups.beforeSend.sort(byStatus);
  groups.afterSend.sort(byStatus);
  return groups;
};

/** 送る前にやることのうち、まだチェックしていない件数 */
export const remainingBeforeSend = (groups: ActionGroups, done: ReadonlySet<string>): number =>
  groups.beforeSend.filter((item) => !done.has(item.id)).length;
