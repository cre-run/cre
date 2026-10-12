import { expect, test } from "vite-plus/test";
import { formatDate, formatMonthDayTime, freshness } from "../src/labels.ts";
import {
  MAX_DECODED_BYTES,
  MAX_ENCODED_LENGTH,
  decodePayload,
  encodePayload,
  isPayload,
  readHash,
  toHash,
} from "../src/payload.ts";
import { samplePayload } from "../src/sample.ts";

test("payload は pako 圧縮を経ても元に戻る", () => {
  expect(decodePayload(encodePayload(samplePayload))).toEqual(samplePayload);
});

test("ハッシュは URL で安全な文字だけでできている", () => {
  const hash = toHash(samplePayload);
  expect(hash).toMatch(/^#d=[\w-]+$/u);
  expect(readHash(hash)).toBe(encodePayload(samplePayload));
});

test("ハッシュに d がなければ null", () => {
  expect(readHash("")).toBeNull();
  expect(readHash("#p=r3")).toBeNull();
});

test("形式の違うデータは読み込まない", () => {
  const broken = encodePayload({ ...samplePayload, version: 2 as 1 });
  expect(() => decodePayload(broken)).toThrow();
  expect(() => decodePayload("not-a-payload")).toThrow();
});

test("入れ子の必須項目や値が不正なデータは読み込まない", () => {
  const { inquiry, reply } = samplePayload;
  const [first, ...rest] = reply.paragraphs;
  const withoutFrom = { ...samplePayload, inquiry: { ...inquiry, from: undefined } };
  const withoutEvidence = {
    ...samplePayload,
    reply: { ...reply, paragraphs: [{ ...first, evidence: undefined }, ...rest] },
  };
  const unknownStatus = {
    ...samplePayload,
    reply: { ...reply, paragraphs: [{ ...first, status: "done" }, ...rest] },
  };
  const invalidDate = { ...samplePayload, generatedAt: "x" };
  const invalidCheckedAt = {
    ...samplePayload,
    reply: {
      ...reply,
      paragraphs: [{ ...first, evidence: [{ ...first.evidence[0], checkedAt: "昨日" }] }, ...rest],
    },
  };
  const duplicateIds = {
    ...samplePayload,
    reply: { ...reply, paragraphs: [first, { ...rest[0], id: first.id }, ...rest.slice(1)] },
  };
  const danglingRef = {
    ...samplePayload,
    reply: { ...reply, paragraphs: [{ ...first, respondsTo: ["q9"] }, ...rest] },
  };
  const duplicateInquiryIds = {
    ...samplePayload,
    inquiry: {
      ...inquiry,
      paragraphs: inquiry.paragraphs.map((p, i) => (i === 1 ? { ...p, id: "q1" } : p)),
    },
  };
  for (const data of [
    danglingRef,
    duplicateInquiryIds,
    withoutFrom,
    withoutEvidence,
    unknownStatus,
    invalidDate,
    invalidCheckedAt,
    duplicateIds,
  ]) {
    expect(isPayload(data)).toBe(false);
    expect(() => decodePayload(encodePayload(data as typeof samplePayload))).toThrow();
  }
  expect(isPayload(samplePayload)).toBe(true);
});

test("根拠のリンクは http(s) だけを受け付ける", () => {
  const { reply } = samplePayload;
  const [first, ...rest] = reply.paragraphs;
  const withUrl = (url: string) => ({
    ...samplePayload,
    reply: {
      ...reply,
      paragraphs: [{ ...first!, evidence: [{ ...first!.evidence[0]!, url }] }, ...rest],
    },
  });
  for (const url of ["https://example.com/terms", "http://intranet/rules#3"]) {
    expect(isPayload(withUrl(url)), url).toBe(true);
  }
  for (const url of [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "//example.com/terms",
    "規約を参照",
  ]) {
    expect(isPayload(withUrl(url)), url).toBe(false);
    expect(() => decodePayload(encodePayload(withUrl(url)))).toThrow();
  }
});

test("大きすぎる圧縮データは展開しない", () => {
  expect(encodePayload(samplePayload).length).toBeLessThan(MAX_ENCODED_LENGTH / 10);
  expect(() => decodePayload("A".repeat(MAX_ENCODED_LENGTH + 1))).toThrow(/大きすぎます/u);
});

test("展開すると大きくなるデータ（展開爆弾）は、途中で打ち切る", () => {
  expect(JSON.stringify(samplePayload).length).toBeLessThan(MAX_DECODED_BYTES / 10);
  // 同じ文字の繰り返しは数百分の 1 に縮むので、圧縮後は短くても展開後は上限を大きく超える
  const bomb = {
    ...samplePayload,
    inquiry: { ...samplePayload.inquiry, subject: "a".repeat(MAX_DECODED_BYTES * 50) },
  };
  const encoded = encodePayload(bomb);
  expect(encoded.length).toBeLessThan(MAX_ENCODED_LENGTH);
  const started = performance.now();
  expect(() => decodePayload(encoded)).toThrow(/大きすぎます（展開後/u);
  // 全部展開してから落とすのではなく、上限を超えた時点でやめている
  expect(performance.now() - started).toBeLessThan(500);
});

test("確認日時の鮮度を判定日時から計算する", () => {
  const now = samplePayload.generatedAt;
  expect(freshness("2026-10-05T10:00:00+09:00", now)).toEqual({ days: 1, level: "fresh" });
  expect(freshness("2026-09-24T10:00:00+09:00", now)).toEqual({ days: 12, level: "recent" });
  expect(freshness("2026-08-22T09:00:00+09:00", now)).toEqual({ days: 45, level: "stale" });
});

test("日時は日本時間で表示する", () => {
  expect(formatDate("2026-10-05T01:00:00Z")).toBe("2026/10/05");
  expect(formatMonthDayTime("2026-10-06T00:15:00Z")).toBe("10月6日 09:15");
});
