// JSON（ReplyReviewPayload。version 1・2 のどちらでもよい）を読み込み、ビューアーに渡す URL ハッシュを出力する。
//   vp run @cre/message-editor#encode -- path/to/payload.json [--base http://localhost:5173/]
// ファイルを省略すると、見本データ（src/sample.ts）をエンコードする。`--sample v2` で version 2 の見本（src/sample-v2.ts）。
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { toHash, type AnyReplyReviewPayload } from "@cre/editor-payload";
import { samplePayloadV2 } from "../src/sample-v2.ts";
import { samplePayload } from "../src/sample.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "" },
    sample: { type: "string", default: "v1" },
  },
});

const file = positionals[0];
const payload: AnyReplyReviewPayload = file
  ? (JSON.parse(readFileSync(file, "utf8")) as AnyReplyReviewPayload)
  : values.sample === "v2"
    ? samplePayloadV2
    : samplePayload;

console.log(`${values.base}${toHash(payload)}`);
