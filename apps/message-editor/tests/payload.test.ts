import { expect, test } from "vite-plus/test";
import { formatDate, formatMonthDayTime, freshness } from "../src/labels.ts";
import { decodePayload, encodePayload, readHash, toHash } from "../src/payload.ts";
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
