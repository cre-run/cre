import { expect, test } from "vite-plus/test";
import { isPayload } from "@cre/editor-payload";
import { collectActions } from "../src/actions.ts";
import { hasContradiction, stanceSummary } from "../src/evidence.ts";
import {
  gapCount,
  initialFocus,
  itemStatusCounts,
  nextWith,
  paragraphText,
  replyItems,
} from "../src/reader.ts";
import { samplePayload } from "../src/sample.ts";

const { reply } = samplePayload;
const items = replyItems(reply);

test("見本データは、判定データの形として正しい", () => {
  expect(isPayload(samplePayload)).toBe(true);
});

test("下線と空欄を本文の順に並べ、段落の何番目にあるかを持つ", () => {
  expect(items.map((item) => [item.id, item.status, item.paragraphIndex])).toEqual([
    ["a1", "verified", 1],
    ["a2", "verified", 2],
    ["a3", "conditional", 2],
    ["g1", "gap", 3],
    ["a4", "recheck", 3],
    ["a5", "verified", 4],
    ["a6", "verified", 4],
  ]);
});

test("内訳は状態ごとの箇所の数で、0 件の状態は出さない", () => {
  expect(itemStatusCounts(items)).toEqual([
    { status: "verified", count: 4 },
    { status: "conditional", count: 1 },
    { status: "recheck", count: 1 },
    { status: "gap", count: 1 },
  ]);
  expect(itemStatusCounts(items.filter((item) => item.status === "verified"))).toEqual([
    { status: "verified", count: 4 },
  ]);
});

test("送る文面は、下線を文章だけにし、空欄を「［要記入：…］」として残す", () => {
  expect(paragraphText(reply.paragraphs[2]!)).toBe(
    "インポートしたデータは、ご解約日から［要記入：解約後、何日でデータを削除するか］を経過した後に削除いたします。個別のご契約がある場合は、その内容が優先されます。",
  );
  expect(paragraphText(reply.paragraphs[0]!)).not.toContain("［");
  expect(gapCount(items)).toBe(1);
});

test("空欄と再確認は送る前、条件ありは送った後。確認済みの下線は出さない", () => {
  const { beforeSend, afterSend } = collectActions(items);
  expect(beforeSend.map((item) => [item.id, item.status, item.index])).toEqual([
    ["g1", "gap", 3],
    ["a4", "recheck", 3],
  ]);
  expect(afterSend.map((item) => [item.id, item.status])).toEqual([["a3", "conditional"]]);
  // 空欄は案内を、下線は nextAction をアクションにする
  expect(beforeSend[0]!.action).toContain("どちらが正しいかを確かめ");
  expect(beforeSend[1]!.action).toBe("お客様の契約に個別の取り決めがあるかを確認する。");
});

test("下線の nextActionTiming は、確認状況による既定の欄より優先する", () => {
  const conditional = items.find((item) => item.id === "a3")!;
  if (conditional.kind !== "assertion") throw new Error("a3 は下線");
  const moved = {
    ...conditional,
    assertion: { ...conditional.assertion, nextActionTiming: "beforeSend" as const },
  };
  const { beforeSend, afterSend } = collectActions([moved]);
  expect(beforeSend.map((item) => item.id)).toEqual(["a3"]);
  expect(afterSend).toEqual([]);
});

test("最初に選ぶのは、指定があればその箇所、なければ最初の確認済み以外の箇所", () => {
  expect(initialFocus(items, "a5")).toBe("a5");
  expect(initialFocus(items, null)).toBe("a3");
  expect(initialFocus(items, "unknown")).toBe("a3");
  expect(initialFocus(items.slice(0, 2), null)).toBe("a1");
  expect(initialFocus([], null)).toBeUndefined();
});

test("根拠の内訳は、0 件の立場を書かずに並べる", () => {
  const evidenceOf = (id: string) => {
    const item = items.find((i) => i.id === id);
    return item?.kind === "assertion" ? item.assertion.evidence : [];
  };
  expect(stanceSummary(evidenceOf("a1"))).toBe("支持 2");
  expect(stanceSummary(evidenceOf("a3"))).toBe("支持 1・条件つき 1");
  expect(stanceSummary([])).toBe("");
  expect(hasContradiction(evidenceOf("a1"))).toBe(false);
  expect(hasContradiction([{ type: "code", stance: "contradicts", title: "実装" }])).toBe(true);
});

test("次の箇所は、今の箇所の後ろから探し、最後まで行ったら先頭に戻る", () => {
  const verified = (item: { status: string }) => item.status === "verified";
  expect(nextWith(items, verified, undefined)?.id).toBe("a1");
  expect(nextWith(items, verified, "a2")?.id).toBe("a5");
  expect(nextWith(items, verified, "a6")?.id).toBe("a1");
  expect(nextWith(items, (item) => item.status === "gap", "g1")?.id).toBe("g1");
  expect(nextWith(items, () => false, "a1")).toBeUndefined();
});
