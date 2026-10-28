/**
 * version 1 の判定データ。利用中の URL（`#d=`）と短縮 URL の保存データを読むためだけに残す。
 * 画面は version 2 だけを扱うので、v1 は読み込むときに upgradeV1 で変換する。
 *
 * version 2 と共通の部分（根拠・確認の内訳など）は version 2 の型を使っている。
 * version 2 でそれらの形を変えるときは、ここに version 1 の形を写してから変える。
 */
import type { Reply, ReplyParagraph, ReplyReviewPayload } from "./types.ts";
import { isPayloadOf, isString } from "./validate.ts";

export interface ReplyParagraphV1 extends Omit<ReplyParagraph, "parts"> {
  text: string;
}

export interface ReplyReviewPayloadV1 extends Omit<ReplyReviewPayload, "version" | "reply"> {
  version: 1;
  reply: Omit<Reply, "paragraphs"> & { paragraphs: ReplyParagraphV1[] };
}

export const isPayloadV1 = (data: unknown): data is ReplyReviewPayloadV1 =>
  isPayloadOf(data, 1, (paragraph) => isString(paragraph.text));

/** version 1 のデータを version 2 の形にする。本文（text）は文章 1 つだけの parts になる */
export const upgradeV1 = (payload: ReplyReviewPayloadV1): ReplyReviewPayload => ({
  ...payload,
  version: 2,
  reply: {
    ...payload.reply,
    paragraphs: payload.reply.paragraphs.map(({ text, ...rest }) => ({
      ...rest,
      parts: [{ text }],
    })),
  },
});
