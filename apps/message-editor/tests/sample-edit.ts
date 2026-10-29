import type { Assertion, ReplyReviewPayload } from "@cre/editor-payload";

/**
 * 判定データの中の 1 つの下線（assertion）だけを書き換えたコピーを返す（テスト用）。
 * change が返す値は検査しないので、不正なデータも作れる
 */
export const withAssertion = (
  payload: ReplyReviewPayload,
  id: string,
  change: (assertion: Assertion) => unknown,
): ReplyReviewPayload => ({
  ...payload,
  reply: {
    ...payload.reply,
    paragraphs: payload.reply.paragraphs.map((paragraph) => ({
      ...paragraph,
      parts: paragraph.parts.map((part) =>
        "assertion" in part && part.assertion.id === id
          ? { assertion: change(part.assertion) as Assertion }
          : part,
      ),
    })),
  },
});
