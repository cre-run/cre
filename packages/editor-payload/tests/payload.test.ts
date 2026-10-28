/**
 * パッケージ単体の最小限のテスト。判定データの約束（送らない・大きすぎるものを受け付けない、など）は
 * apps/message-editor/tests/data-handling.test.ts がガイドと突き合わせて確かめる。
 */
import { expect, test } from "vite-plus/test";
import {
  MAX_ENCODED_LENGTH,
  RetiredVersionError,
  decodePayload,
  encodePayload,
  isPayload,
  parsePayload,
  readHash,
  toHash,
  type Assertion,
  type ReplyReviewPayload,
} from "../src/index.ts";

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
        respondsTo: ["q1"],
        parts: [{ text: "あいさつ。" }, { assertion }, { gap }],
      },
    ],
  },
};

const withParts = (parts: unknown) => ({
  ...payload,
  reply: { ...payload.reply, paragraphs: [{ ...payload.reply.paragraphs[0], parts }] },
});

test("圧縮して展開すると元に戻る", () => {
  expect(decodePayload(encodePayload(payload))).toEqual(payload);
  expect(parsePayload(payload)).toBe(payload);
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

test("version 1（段落ごとの判定）のデータは受け付けず、廃止したことを RetiredVersionError で知らせる", () => {
  const v1 = {
    ...payload,
    version: 1,
    reply: {
      ...payload.reply,
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
  expect(isPayload(v1)).toBe(false);
  expect(() => decodePayload(encodePayload(v1 as unknown as ReplyReviewPayload))).toThrow(
    RetiredVersionError,
  );
  // 形だけ version 1 のものも、中身を問わず廃止の案内にする
  expect(() => parsePayload({ version: 1 })).toThrow(/version 1）は廃止されました/u);
  try {
    parsePayload(v1);
  } catch (error) {
    expect(error).toBeInstanceOf(RetiredVersionError);
    expect((error as RetiredVersionError).version).toBe(1);
  }
});

test("圧縮データが長すぎるものは展開しない", () => {
  expect(() => decodePayload("A".repeat(MAX_ENCODED_LENGTH + 1))).toThrow(/大きすぎます/u);
});

test("作成モード（mode）は standard・flash だけを受け付け、省略もできる", () => {
  expect(isPayload(payload)).toBe(true);
  expect(isPayload({ ...payload, mode: "standard" })).toBe(true);
  expect(isPayload({ ...payload, mode: "flash" })).toBe(true);
  expect(isPayload({ ...payload, mode: "fast" })).toBe(false);
  expect(isPayload({ ...payload, mode: 1 })).toBe(false);
});

test("本文は、文章・下線（assertion）・空欄（gap）のどれか 1 つを並べたものだけを受け付ける", () => {
  expect(isPayload(withParts([]))).toBe(true);
  expect(
    isPayload(
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

  expect(isPayload(withParts(undefined))).toBe(false);
  expect(isPayload(withParts("本文"))).toBe(false);
  expect(isPayload(withParts([{}]))).toBe(false);
  expect(isPayload(withParts([{ text: "本文", gap }]))).toBe(false);
  expect(isPayload(withParts([{ gap: { id: "g1" } }]))).toBe(false);
  expect(isPayload(withParts([{ gap: { ...gap, options: [{}] } }]))).toBe(false);
});

test("下線の確認状況は確認済み・条件あり・再確認だけ。根拠のない箇所は空欄（gap）にする", () => {
  const withStatus = (status: unknown) => withParts([{ assertion: { ...assertion, status } }]);
  expect(isPayload(withStatus("verified"))).toBe(true);
  expect(isPayload(withStatus("recheck"))).toBe(true);
  expect(isPayload(withStatus("unverified"))).toBe(false);
  // 根拠・評価・見出しがない下線は、右パネルに出すものがないので受け付けない
  for (const key of ["evidence", "checks", "topic", "summary"]) {
    expect(isPayload(withParts([{ assertion: { ...assertion, [key]: undefined } }])), key).toBe(
      false,
    );
  }
});

test("下線の nextActionTiming は beforeSend・afterSend だけを受け付ける", () => {
  const withTiming = (nextActionTiming: unknown) =>
    withParts([{ assertion: { ...assertion, nextActionTiming } }]);
  expect(isPayload(withTiming("beforeSend"))).toBe(true);
  expect(isPayload(withTiming("afterSend"))).toBe(true);
  expect(isPayload(withTiming(undefined))).toBe(true);
  expect(isPayload(withTiming("later"))).toBe(false);
});

test("下線と空欄の ID は、段落をまたいでも重複させない", () => {
  const second = { id: "r2", respondsTo: ["q1"], parts: [{ gap: { ...gap, id: "a1" } }] };
  const duplicated = {
    ...payload,
    reply: { ...payload.reply, paragraphs: [...payload.reply.paragraphs, second] },
  };
  expect(isPayload(duplicated)).toBe(false);
  expect(isPayload(withParts([{ assertion }, { assertion }]))).toBe(false);
});
