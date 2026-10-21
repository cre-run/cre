import { expect, test } from "vite-plus/test";
import { EDITED_ACTION, collectActions, remainingBeforeSend } from "../src/actions.ts";
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

test("条件ありでも送る前を指定すれば「送る前にやること」に入り、再確認の後に並ぶ", () => {
  const [first, second] = paragraphs;
  const { beforeSend, afterSend } = collectActions([
    {
      ...first!,
      id: "a",
      status: "conditional",
      nextAction: "送る前に開発担当へ開示してよいかを確認する。",
      nextActionTiming: "beforeSend",
    },
    { ...second!, id: "b", status: "recheck" },
  ]);
  expect(beforeSend.map((item) => [item.paragraphId, item.status])).toEqual([
    ["b", "recheck"],
    ["a", "conditional"],
  ]);
  expect(beforeSend[1]?.action).toBe("送る前に開発担当へ開示してよいかを確認する。");
  expect(afterSend).toEqual([]);
});

test("再確認でも送った後を指定すれば「送った後のフォロー」に入る", () => {
  const [first] = paragraphs;
  const { beforeSend, afterSend } = collectActions([
    { ...first!, id: "a", status: "recheck", nextActionTiming: "afterSend" },
  ]);
  expect(beforeSend).toEqual([]);
  expect(afterSend.map((item) => item.paragraphId)).toEqual(["a"]);
});

test("確認済みの段落は送る前を指定してもアクションに含めない", () => {
  const [first] = paragraphs;
  const { beforeSend, afterSend } = collectActions([
    { ...first!, id: "a", status: "verified", nextActionTiming: "beforeSend" },
  ]);
  expect([...beforeSend, ...afterSend]).toEqual([]);
});

test("確認済みの段落は、書き換えたときだけ送る前に「編集した内容を確かめる」を入れ、最後に並べる", () => {
  const edited = new Set(["r1", "r3"]);
  const { beforeSend } = collectActions(paragraphs, edited);
  expect(beforeSend.map((item) => [item.paragraphId, item.status, item.edited])).toEqual([
    ["r3", "recheck", true],
    ["r1", "verified", true],
  ]);
  expect(beforeSend[1]).toMatchObject({ action: EDITED_ACTION, owners: [] });
  // 書き換えていなければ、確認済みの段落は入れない
  expect(collectActions(paragraphs).beforeSend.map((item) => item.paragraphId)).toEqual(["r3"]);
});

test("送る前にやることの残りは、チェックしていない件数", () => {
  const groups = collectActions(paragraphs, new Set(["r1"]));
  expect(remainingBeforeSend(groups, new Set())).toBe(2);
  expect(remainingBeforeSend(groups, new Set(["r3"]))).toBe(1);
  // 送った後のフォローは数えない
  expect(remainingBeforeSend(groups, new Set(["r1", "r3"]))).toBe(0);
});
