/**
 * ガイド（apps/docs/docs/message-editor/index.mdx）の「デモと同じ内容を URL で渡す」例が、
 * 見本データ（src/sample.ts）と同じ内容のままであることを確かめる。
 * 落ちたら `vp run @cre/message-editor#encode -- --base https://editor.cre.run/` の出力でガイドの URL を置き換える。
 */
import { expect, test } from "vite-plus/test";
import { decodePayload } from "@cre/editor-payload";
import { samplePayloadV2 } from "../src/sample-v2.ts";
import { samplePayload } from "../src/sample.ts";
import { guideExampleHashes } from "./guide-example.ts";

test("ガイドの URL の例は、見本データと同じ内容を表す", () => {
  const hashes = guideExampleHashes();
  // リンクと全文の 2 か所に載せている
  expect(hashes.length).toBeGreaterThanOrEqual(2);
  for (const encoded of hashes) {
    expect(decodePayload(encoded)).toEqual(samplePayload);
  }
});

test("下線ごとの確認のガイドの URL の例は、version 2 の見本データと同じ内容を表す", () => {
  // 落ちたら `node scripts/encode.ts --sample v2 --base https://editor.cre.run/` の出力で置き換える
  const hashes = guideExampleHashes("assertions.mdx");
  expect(hashes.length).toBeGreaterThanOrEqual(1);
  for (const encoded of hashes) {
    expect(decodePayload(encoded)).toEqual(samplePayloadV2);
  }
});
