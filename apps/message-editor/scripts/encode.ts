// JSON（ReplyReviewPayload）を読み込み、ビューアーに渡す URL ハッシュを出力する。
//   vp run @cre/message-editor#encode -- path/to/payload.json [--base http://localhost:5173/]
// ファイルを省略すると、見本データ（src/sample.ts）をエンコードする。
// version 1 の JSON は version 2 の形にしてからエンコードする（形式が不正なら止める）。
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parsePayload, toHash, type ReplyReviewPayload } from "@cre/editor-payload";
import { samplePayload } from "../src/sample.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { base: { type: "string", default: "" } },
});

const file = positionals[0];
const payload: ReplyReviewPayload = file
  ? parsePayload(JSON.parse(readFileSync(file, "utf8")))
  : samplePayload;

console.log(`${values.base}${toHash(payload)}`);
