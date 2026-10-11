import { expect, test } from "vite-plus/test";
import { collectActions } from "../src/actions.ts";
import { samplePayload } from "../src/sample.ts";

const paragraphs = samplePayload.reply.paragraphs;

test("確認済みの段落はアクションに含めない", () => {
  const { beforeSend, afterSend } = collectActions(paragraphs);
  const ids = [...beforeSend, ...afterSend].map((item) => item.paragraphId);
  expect(ids).toEqual(["r3", "r2"]);
});

test("再確認は送る前、条件ありは送った後に分ける", () => {
  const { beforeSend, afterSend } = collectActions(paragraphs);
  expect(beforeSend.map((item) => [item.paragraphId, item.index, item.status])).toEqual([
    ["r3", 3, "recheck"],
  ]);
  expect(afterSend.map((item) => [item.paragraphId, item.index, item.status])).toEqual([
    ["r2", 2, "conditional"],
  ]);
  expect(beforeSend[0]?.action).toBe(paragraphs[2]?.nextAction);
  expect(beforeSend[0]?.owners).toEqual(["開発担当", "法務担当"]);
});

test("根拠なしは再確認より先に並べ、次のアクションがなければ既定の文を使う", () => {
  const [first, second] = paragraphs;
  const { beforeSend } = collectActions([
    { ...first!, id: "a", status: "recheck" },
    { ...second!, id: "b", status: "unverified", nextAction: undefined, owners: undefined },
  ]);
  expect(beforeSend.map((item) => item.paragraphId)).toEqual(["b", "a"]);
  expect(beforeSend[0]).toMatchObject({ action: "根拠を探して確認する。", owners: [] });
});

test("すべて確認済みならアクションはない", () => {
  const all = paragraphs.map((p) => ({ ...p, status: "verified" as const }));
  expect(collectActions(all)).toEqual({ beforeSend: [], afterSend: [] });
});
