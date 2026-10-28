/**
 * 下線ごとの画面（判定データ version 2）のロジック。
 * 下線（assertion）と空欄（gap）を「箇所」として扱い、確認状況・改善アクション・送る文面を作る。
 */
import type {
  Assertion,
  AssertionStatus,
  Gap,
  NextActionTiming,
  ReplyParagraphV2,
  ReplyV2,
} from "@cre/editor-payload";
import type { ActionGroups, ActionItem } from "./actions.ts";

/** 箇所の状態。下線の確認状況か、空欄（gap） */
export type ItemStatus = AssertionStatus | "gap";

/** 内訳・凡例に並べる順 */
export const ITEM_STATUS_ORDER: ItemStatus[] = ["verified", "conditional", "recheck", "gap"];

export type ReplyItem = {
  id: string;
  /** 箇所を含む段落の ID と、返信の何段落目か（1 始まり） */
  paragraphId: string;
  paragraphIndex: number;
} & (
  | { kind: "assertion"; status: AssertionStatus; assertion: Assertion }
  | { kind: "gap"; status: "gap"; gap: Gap }
);

/** 返信の中の下線と空欄を、本文の順に並べる */
export const replyItems = (reply: ReplyV2): ReplyItem[] =>
  reply.paragraphs.flatMap((paragraph, i) =>
    paragraph.parts.flatMap((part): ReplyItem[] => {
      const base = { paragraphId: paragraph.id, paragraphIndex: i + 1 };
      if ("assertion" in part) {
        const { assertion } = part;
        return [
          { ...base, id: assertion.id, kind: "assertion", status: assertion.status, assertion },
        ];
      }
      if ("gap" in part) {
        return [{ ...base, id: part.gap.id, kind: "gap", status: "gap", gap: part.gap }];
      }
      return [];
    }),
  );

/** 状態ごとの箇所の数。0 件の状態は含めない */
export const itemStatusCounts = (items: ReplyItem[]): { status: ItemStatus; count: number }[] =>
  ITEM_STATUS_ORDER.map((status) => ({
    status,
    count: items.filter((item) => item.status === status).length,
  })).filter(({ count }) => count > 0);

/** 送る文面に残す空欄の印。コピーしたあとに書き起こし忘れないよう、目立つ形にする */
export const gapMarker = (gap: Gap): string => `［要記入：${gap.question}］`;

/** 段落の送る文面。下線は文章だけにし、空欄は「［要記入：…］」として残す */
export const paragraphText = (paragraph: ReplyParagraphV2): string =>
  paragraph.parts
    .map((part) =>
      "text" in part ? part.text : "assertion" in part ? part.assertion.text : gapMarker(part.gap),
    )
    .join("");

/** 空欄の数（送る前に書き起こす必要がある） */
export const gapCount = (items: ReplyItem[]): number =>
  items.filter((item) => item.kind === "gap").length;

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
export const collectItemActions = (items: ReplyItem[]): ActionGroups => {
  const groups: ActionGroups = { beforeSend: [], afterSend: [] };
  for (const item of items) {
    const base = { id: item.id, index: item.paragraphIndex, edited: false };
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

/**
 * 最初に選ぶ箇所。`#f=<ID>` で指定があればそれ（モック画像の撮影用）、
 * なければ本文の順で最初の確認済み以外の箇所、それもなければ最初の箇所
 */
export const initialFocus = (items: ReplyItem[], requested: string | null): string | undefined =>
  (
    items.find((item) => item.id === requested) ??
    items.find((item) => item.status !== "verified") ??
    items[0]
  )?.id;
