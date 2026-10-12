// JSON（ReplyReviewPayload）を読み込み、ビューアーに渡す URL ハッシュを出力する。
//   vp run @cre/message-editor#encode -- path/to/payload.json [--base http://localhost:5173/]
// ファイルを省略すると、見本データ（src/sample.ts）をエンコードする。
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { toHash, type ReplyReviewPayload } from "@cre/editor-payload";
import { samplePayload } from "../src/sample.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { base: { type: "string", default: "" } },
});

const file = positionals[0];
const payload: ReplyReviewPayload = file
  ? (JSON.parse(readFileSync(file, "utf8")) as ReplyReviewPayload)
  : samplePayload;

console.log(`${values.base}${toHash(payload)}`);
