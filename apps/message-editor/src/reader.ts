/**
 * 返信の本文のロジック。下線（assertion）と空欄（gap）を「箇所」として扱い、
 * 確認状況の内訳・送る文面・最初に選ぶ箇所を決める。
 */
import type { Assertion, AssertionStatus, Gap, Reply, ReplyParagraph } from "@cre/editor-payload";

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
export const replyItems = (reply: Reply): ReplyItem[] =>
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
export const paragraphText = (paragraph: ReplyParagraph): string =>
  paragraph.parts
    .map((part) =>
      "text" in part ? part.text : "assertion" in part ? part.assertion.text : gapMarker(part.gap),
    )
    .join("");

/** 空欄の数（送る前に書き起こす必要がある） */
export const gapCount = (items: ReplyItem[]): number =>
  items.filter((item) => item.kind === "gap").length;

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

/**
 * 条件に合う箇所のうち、今選んでいる箇所の次のもの（最後まで行ったら先頭に戻る）。
 * 今選んでいる箇所が条件に合わなければ、先頭から数えて最初のもの。
 */
export const nextWith = <T extends { id: string }>(
  items: T[],
  matches: (item: T) => boolean,
  currentId: string | undefined,
): T | undefined => {
  const at = items.findIndex((item) => item.id === currentId);
  const ordered = [...items.slice(at + 1), ...items.slice(0, at + 1)];
  return ordered.find(matches);
};
