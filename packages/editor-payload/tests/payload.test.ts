/**
 * パッケージ単体の最小限のテスト。判定データの約束（送らない・大きすぎるものを受け付けない、など）は
 * apps/message-editor/tests/data-handling.test.ts がガイドと突き合わせて確かめる。
 */
import { expect, test } from "vite-plus/test";
import {
  MAX_ENCODED_LENGTH,
  decodePayload,
  encodePayload,
  isPayload,
  readHash,
  toHash,
  type ReplyReviewPayload,
} from "../src/index.ts";

const payload: ReplyReviewPayload = {
  version: 1,
  generatedAt: "2026-10-06T10:00:00+09:00",
  inquiry: {
    from: "田中 様",
    subject: "件名",
    receivedAt: "2026-10-05T09:00:00+09:00",
    paragraphs: [{ id: "q1", text: "問い合わせ" }],
  },
  reply: {
    to: "田中 様",
    subject: "Re: 件名",
    paragraphs: [
      {
        id: "r1",
        topic: "要点",
        text: "返信",
        summary: "要約",
        respondsTo: ["q1"],
        status: "verified",
        checks: [],
        evidence: [],
      },
    ],
  },
};

test("圧縮して展開すると元に戻る", () => {
  expect(decodePayload(encodePayload(payload))).toEqual(payload);
});

test("ハッシュは #d= と URL で安全な文字だけでできている", () => {
  const hash = toHash(payload);
  expect(hash).toMatch(/^#d=[\w-]+$/u);
  expect(readHash(hash)).toBe(encodePayload(payload));
});

test("形式の違うデータは受け付けない", () => {
  expect(isPayload({ ...payload, version: 2 })).toBe(false);
  expect(() => decodePayload(encodePayload({ ...payload, version: 2 as 1 }))).toThrow();
});

test("圧縮データが長すぎるものは展開しない", () => {
  expect(() => decodePayload("A".repeat(MAX_ENCODED_LENGTH + 1))).toThrow(/大きすぎます/u);
});
