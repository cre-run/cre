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
  isPayloadV2,
  parsePayload,
  readHash,
  toHash,
  type Assertion,
  type ReplyReviewPayload,
  type ReplyReviewPayloadV2,
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

test("nextActionTiming は beforeSend・afterSend だけを受け付ける", () => {
  const withTiming = (nextActionTiming: unknown) => ({
    ...payload,
    reply: {
      ...payload.reply,
      paragraphs: [{ ...payload.reply.paragraphs[0], nextActionTiming }],
    },
  });
  expect(isPayload(withTiming("beforeSend"))).toBe(true);
  expect(isPayload(withTiming("afterSend"))).toBe(true);
  expect(isPayload(withTiming(undefined))).toBe(true);
  expect(isPayload(withTiming("later"))).toBe(false);
});

test("文ごとの判定（claims）は、文と確認状況がそろっているものだけを受け付ける", () => {
  const withClaims = (claims: unknown) => ({
    ...payload,
    reply: {
      ...payload.reply,
      paragraphs: [{ ...payload.reply.paragraphs[0], claims }],
    },
  });
  expect(isPayload(withClaims(undefined))).toBe(true);
  expect(isPayload(withClaims([{ text: "返信", status: "recheck", note: "理由" }]))).toBe(true);
  expect(isPayload(withClaims([{ text: "返信", status: "unknown" }]))).toBe(false);
  expect(isPayload(withClaims([{ status: "recheck" }]))).toBe(false);
  expect(isPayload(withClaims("返信"))).toBe(false);
});

test("作成モード（mode）は standard・flash だけを受け付け、省略もできる", () => {
  expect(isPayload(payload)).toBe(true);
  expect(isPayload({ ...payload, mode: "standard" })).toBe(true);
  expect(isPayload({ ...payload, mode: "flash" })).toBe(true);
  expect(isPayload({ ...payload, mode: "fast" })).toBe(false);
  expect(isPayload({ ...payload, mode: 1 })).toBe(false);
});

const assertion: Assertion = {
  id: "a1",
  text: "確かめた文。",
  status: "conditional",
  topic: "見出し",
  summary: "要約",
  checks: [],
  evidence: [{ type: "faq", stance: "conditional", title: "FAQ" }],
};
const gap = { id: "g1", question: "決めること" };

const payloadV2: ReplyReviewPayloadV2 = {
  version: 2,
  generatedAt: payload.generatedAt,
  inquiry: payload.inquiry,
  reply: {
    to: "田中 様",
    subject: "Re: 件名",
    paragraphs: [
      {
        id: "r1",
        respondsTo: ["q1"],
        parts: [{ text: "あいさつ。" }, { assertion }, { gap }],
      },
    ],
  },
};

const withParts = (parts: unknown) => ({
  ...payloadV2,
  reply: { ...payloadV2.reply, paragraphs: [{ ...payloadV2.reply.paragraphs[0], parts }] },
});

test("version 1 と 2 は、それぞれの形のまま圧縮・展開できる（変換しない）", () => {
  expect(decodePayload(encodePayload(payload))).toEqual(payload);
  expect(decodePayload(encodePayload(payloadV2))).toEqual(payloadV2);
  expect(parsePayload(payload)).toBe(payload);
  expect(parsePayload(payloadV2)).toBe(payloadV2);
});

test("version 1 と 2 の形は混ぜられない", () => {
  expect(isPayload(payloadV2)).toBe(false);
  expect(isPayloadV2(payload)).toBe(false);
  expect(isPayloadV2({ ...payload, version: 2 })).toBe(false);
  expect(isPayload({ ...payloadV2, version: 1 })).toBe(false);
  expect(() => parsePayload({ ...payloadV2, version: 3 })).toThrow(/形式が正しくありません/u);
});

test("version 2 の本文は、文章・下線（assertion）・空欄（gap）のどれか 1 つを並べたものだけを受け付ける", () => {
  expect(isPayloadV2(withParts([]))).toBe(true);
  expect(
    isPayloadV2(
      withParts([
        {
          gap: {
            ...gap,
            guidance: "案内",
            options: [
              { label: "30 日", evidence: [{ type: "terms", stance: "supports", title: "規約" }] },
              { label: "60 日" },
            ],
            owners: ["法務担当"],
          },
        },
      ]),
    ),
  ).toBe(true);

  expect(isPayloadV2(withParts(undefined))).toBe(false);
  expect(isPayloadV2(withParts("本文"))).toBe(false);
  expect(isPayloadV2(withParts([{}]))).toBe(false);
  expect(isPayloadV2(withParts([{ text: "本文", gap }]))).toBe(false);
  expect(isPayloadV2(withParts([{ gap: { id: "g1" } }]))).toBe(false);
  expect(isPayloadV2(withParts([{ gap: { ...gap, options: [{}] } }]))).toBe(false);
});

test("下線の確認状況は確認済み・条件あり・再確認だけ。根拠のない箇所は空欄（gap）にする", () => {
  const withStatus = (status: unknown) => withParts([{ assertion: { ...assertion, status } }]);
  expect(isPayloadV2(withStatus("verified"))).toBe(true);
  expect(isPayloadV2(withStatus("recheck"))).toBe(true);
  expect(isPayloadV2(withStatus("unverified"))).toBe(false);
  // 根拠・評価・見出しがない下線は、右パネルに出すものがないので受け付けない
  for (const key of ["evidence", "checks", "topic", "summary"]) {
    expect(isPayloadV2(withParts([{ assertion: { ...assertion, [key]: undefined } }])), key).toBe(
      false,
    );
  }
});

test("下線と空欄の ID は、段落をまたいでも重複させない", () => {
  const second = { id: "r2", respondsTo: ["q1"], parts: [{ gap: { ...gap, id: "a1" } }] };
  const duplicated = {
    ...payloadV2,
    reply: { ...payloadV2.reply, paragraphs: [...payloadV2.reply.paragraphs, second] },
  };
  expect(isPayloadV2(duplicated)).toBe(false);
  expect(isPayloadV2(withParts([{ assertion }, { assertion }]))).toBe(false);
});
