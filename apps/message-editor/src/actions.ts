import type { ParagraphStatus, ReplyParagraph } from "./types.ts";

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
  /** 送る前に確認・修正すること（再確認・根拠なし） */
  beforeSend: ActionItem[];
  /** 送った後にフォローすること（条件あり：お客様の回答を待って案内するなど） */
  afterSend: ActionItem[];
}

const BEFORE_SEND: ParagraphStatus[] = ["unverified", "recheck"];

const FALLBACK: Record<ParagraphStatus, string> = {
  verified: "",
  conditional: "条件に当てはまるかをお客様に確認する。",
  recheck: "根拠を確認し直す。",
  unverified: "根拠を探して確認する。",
};

/** 確認済み以外の段落から、取るべきアクションを「送る前／送った後」に分けて集める */
export const collectActions = (paragraphs: ReplyParagraph[]): ActionGroups => {
  const items = paragraphs.flatMap((p, i): ActionItem[] =>
    p.status === "verified"
      ? []
      : [
          {
            paragraphId: p.id,
            index: i + 1,
            topic: p.topic,
            status: p.status,
            action: p.nextAction ?? FALLBACK[p.status],
            owners: p.owners ?? [],
          },
        ],
  );
  // 根拠なしを先頭に、次に再確認を並べる
  const beforeSend = items
    .filter((item) => BEFORE_SEND.includes(item.status))
    .sort((a, b) => BEFORE_SEND.indexOf(a.status) - BEFORE_SEND.indexOf(b.status));
  const afterSend = items.filter((item) => !BEFORE_SEND.includes(item.status));
  return { beforeSend, afterSend };
};
