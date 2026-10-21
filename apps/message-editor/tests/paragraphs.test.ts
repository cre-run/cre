import { expect, test } from "vite-plus/test";
import {
  hasContradiction,
  isEdited,
  nextWith,
  splitByClaims,
  stanceSummary,
  statusCounts,
} from "../src/paragraphs.ts";
import { samplePayload } from "../src/sample.ts";

const paragraphs = samplePayload.reply.paragraphs;
const [r1, r2, r3, r4] = paragraphs;

test("書き換えていない・前後の空白だけが違う本文は、編集済みにしない", () => {
  expect(isEdited(r1!, undefined)).toBe(false);
  expect(isEdited(r1!, r1!.text)).toBe(false);
  expect(isEdited(r1!, `${r1!.text}\n`)).toBe(false);
  expect(isEdited(r1!, `${r1!.text}（追記）`)).toBe(true);
});

test("確認済み以外の文だけに印を付け、本文はそのまま全部残す", () => {
  const segments = splitByClaims("A です。B です。C です。", [
    { text: "A です。", status: "verified" },
    { text: "B です。", status: "recheck", note: "理由" },
    { text: "C です。", status: "conditional" },
  ]);
  expect(segments.map((s) => [s.text, s.claim?.status])).toEqual([
    ["A です。", undefined],
    ["B です。", "recheck"],
    ["C です。", "conditional"],
  ]);
});

test("本文に見つからない文・重なる文には印を付けない", () => {
  const text = "A です。B です。";
  const segments = splitByClaims(text, [
    { text: "B です。", status: "recheck" },
    { text: "です。B", status: "unverified" },
    { text: "Z です。", status: "recheck" },
  ]);
  expect(segments.map((s) => s.text).join("")).toBe(text);
  expect(segments.filter((s) => s.claim).map((s) => s.text)).toEqual(["です。B"]);
  expect(splitByClaims(text, undefined)).toEqual([{ text }]);
  expect(splitByClaims("", [])).toEqual([{ text: "" }]);
});

test("見本データの段落 2 は、条件ありの文だけに印が付く", () => {
  const marked = splitByClaims(r2!.text, r2!.claims).filter((s) => s.claim);
  expect(marked.map((s) => s.claim?.status)).toEqual(["conditional"]);
  expect(marked[0]?.text).toContain("SSO の強制");
});

test("根拠の内訳は、0 件の立場を書かずに並べる", () => {
  expect(stanceSummary(r3!.evidence)).toBe("支持 1・食い違い 1");
  expect(stanceSummary(r1!.evidence)).toBe("支持 2");
  expect(stanceSummary(r2!.evidence)).toBe("支持 1・条件つき 1");
  expect(stanceSummary([])).toBe("");
  expect(hasContradiction(r3!.evidence)).toBe(true);
  expect(hasContradiction(r1!.evidence)).toBe(false);
});

test("状態ごとの段落の数は、0 件の状態を含めない", () => {
  expect(statusCounts(paragraphs)).toEqual([
    { status: "verified", count: 2 },
    { status: "conditional", count: 1 },
    { status: "recheck", count: 1 },
  ]);
});

test("次の段落は、今の段落の後ろから探し、最後まで行ったら先頭に戻る", () => {
  const verified = (p: { status: string }) => p.status === "verified";
  expect(nextWith(paragraphs, verified, undefined)?.id).toBe("r1");
  expect(nextWith(paragraphs, verified, "r1")?.id).toBe("r4");
  expect(nextWith(paragraphs, verified, r4!.id)?.id).toBe("r1");
  expect(nextWith(paragraphs, (p) => p.status === "recheck", "r3")?.id).toBe("r3");
  expect(nextWith(paragraphs, (p) => p.status === "unverified", "r1")).toBeUndefined();
});
