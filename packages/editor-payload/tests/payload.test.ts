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
  isPayloadV1,
  parsePayload,
  readHash,
  toHash,
  upgradeV1,
  type ReplyReviewPayload,
  type ReplyReviewPayloadV1,
} from "../src/index.ts";

const payload: ReplyReviewPayload = {
  version: 2,
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
        parts: [{ text: "返信" }],
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
  expect(isPayload({ ...payload, version: 3 })).toBe(false);
  expect(() => decodePayload(encodePayload({ ...payload, version: 3 as 2 }))).toThrow(
    /形式が正しくありません/u,
  );
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

const withParts = (parts: unknown) => ({
  ...payload,
  reply: { ...payload.reply, paragraphs: [{ ...payload.reply.paragraphs[0], parts }] },
});

test("本文（parts）は文章と、書く必要のある箇所（gap）を並べたものだけを受け付ける", () => {
  const gap = { id: "g1", question: "保存期間は何日か" };
  expect(isPayload(withParts([]))).toBe(true);
  expect(isPayload(withParts([{ text: "前" }, { gap }, { text: "後" }]))).toBe(true);
  expect(
    isPayload(
      withParts([
        {
          gap: {
            ...gap,
            options: [
              {
                label: "30 日（利用規約）",
                evidence: [{ type: "terms", stance: "supports", title: "第 12 条" }],
              },
              { label: "60 日（実装）" },
            ],
            owners: ["法務担当"],
          },
        },
      ]),
    ),
  ).toBe(true);

  expect(isPayload(withParts(undefined))).toBe(false);
  expect(isPayload(withParts("返信"))).toBe(false);
  expect(isPayload(withParts([{}]))).toBe(false);
  expect(isPayload(withParts([{ text: "返信", gap }]))).toBe(false);
  expect(isPayload(withParts([{ gap: { id: "g1" } }]))).toBe(false);
  expect(isPayload(withParts([{ gap: { ...gap, options: [{}] } }]))).toBe(false);
  // 段落の中で同じ ID の箇所は区別できない
  expect(isPayload(withParts([{ gap }, { gap }]))).toBe(false);
});

test("version 2 に text だけの段落（version 1 の形）は受け付けない", () => {
  const v1Paragraph = { ...payload.reply.paragraphs[0], parts: undefined, text: "返信" };
  expect(isPayload({ ...payload, reply: { ...payload.reply, paragraphs: [v1Paragraph] } })).toBe(
    false,
  );
});

/** version 1 の形のデータ。v1 で使えた項目をひととおり入れる */
const v1Json: ReplyReviewPayloadV1 = {
  version: 1,
  generatedAt: "2026-10-06T10:00:00+09:00",
  model: { name: "decision-model", version: "0.1" },
  mode: "flash",
  inquiry: payload.inquiry,
  reply: {
    to: "田中 様",
    subject: "Re: 件名",
    opening: "田中 様",
    closing: "サポートチーム",
    paragraphs: [
      {
        id: "r1",
        topic: "要点",
        text: "確認済みの文です。確かめが必要な文です。",
        respondsTo: ["q1"],
        status: "conditional",
        method: "社内FAQ で確認",
        summary: "要約",
        checks: [{ label: "観点", result: "warn", note: "メモ" }],
        conditions: "条件",
        evidence: [
          {
            type: "faq",
            stance: "conditional",
            title: "FAQ",
            excerpt: "抜粋",
            source: "社内FAQ",
            url: "https://example.com/faq",
            checkedAt: "2026-10-01T10:00:00+09:00",
          },
        ],
        nextAction: "確かめる",
        nextActionTiming: "beforeSend",
        owners: ["CS担当"],
        claims: [{ text: "確かめが必要な文です。", status: "conditional", note: "理由" }],
      },
      {
        id: "r2",
        topic: "要点 2",
        text: "2 つ目の段落です。",
        respondsTo: ["q1"],
        status: "verified",
        summary: "要約",
        checks: [],
        evidence: [],
      },
    ],
  },
};
/**
 * version 1 の時点の URL の文字列。圧縮の方式（JSON → deflate → base64url）は v1 から変えていないので、
 * v1 の JSON を encodePayload に通したものは、v1 の画面で作った URL と同じ文字列になる
 */
const v1Encoded = encodePayload(v1Json as unknown as ReplyReviewPayload);

test("version 1 で作った URL の文字列は、そのまま version 2 の形で読める", () => {
  expect(isPayloadV1(v1Json)).toBe(true);
  const decoded = decodePayload(v1Encoded);
  expect(isPayload(decoded)).toBe(true);
  expect(decoded).toEqual(upgradeV1(v1Json));
});

test("upgradeV1 は本文（text）を文章 1 つの parts にし、ほかの項目はそのまま残す", () => {
  const upgraded = upgradeV1(v1Json);
  expect(upgraded.version).toBe(2);
  const { reply: v1Reply, version: _v1, ...v1Rest } = v1Json;
  const { reply, version: _v2, ...rest } = upgraded;
  expect(rest).toEqual(v1Rest);
  expect({ ...reply, paragraphs: undefined }).toEqual({ ...v1Reply, paragraphs: undefined });
  expect(reply.paragraphs).toHaveLength(v1Reply.paragraphs.length);
  reply.paragraphs.forEach((paragraph, i) => {
    const { text, ...v1Paragraph } = v1Reply.paragraphs[i];
    expect(paragraph).toEqual({ ...v1Paragraph, parts: [{ text }] });
    expect(paragraph).not.toHaveProperty("text");
  });
});

test("upgradeV1 は元のデータを書き換えない", () => {
  const before = structuredClone(v1Json);
  upgradeV1(v1Json);
  expect(v1Json).toEqual(before);
});

test("version 1 でも、形式が不正なものは読み込まない", () => {
  const [first, ...rest] = v1Json.reply.paragraphs;
  const broken = (paragraph: unknown) => ({
    ...v1Json,
    reply: { ...v1Json.reply, paragraphs: [paragraph, ...rest] },
  });
  expect(() => parsePayload(broken({ ...first, text: undefined }))).toThrow();
  expect(() => parsePayload(broken({ ...first, status: "done" }))).toThrow();
  // version 1 に parts だけの段落は v1 の形ではない
  expect(() =>
    parsePayload(broken({ ...first, text: undefined, parts: [{ text: "x" }] })),
  ).toThrow();
});
