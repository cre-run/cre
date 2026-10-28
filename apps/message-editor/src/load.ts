import {
  decodePayload,
  readHash,
  type AnyReplyReviewPayload,
  type ReplyReviewPayload,
} from "@cre/editor-payload";
import { samplePayload } from "./sample.ts";
import { samplePayloadV2 } from "./sample-v2.ts";

export type Loaded =
  | { kind: "data"; payload: AnyReplyReviewPayload }
  | { kind: "sample"; payload: AnyReplyReviewPayload }
  | { kind: "error"; message: string; payload: ReplyReviewPayload };

export const hashParam = (hash: string, key: string): string | null =>
  new URLSearchParams(hash.replace(/^#/u, "")).get(key);

export const load = (hash: string): Loaded => {
  const encoded = readHash(hash);
  if (!encoded) {
    // `#sample=v2` で下線ごとの画面（version 2）の見本を表示する
    const sample = hashParam(hash, "sample") === "v2" ? samplePayloadV2 : samplePayload;
    return { kind: "sample", payload: sample };
  }
  try {
    return { kind: "data", payload: decodePayload(encoded) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "error", message, payload: samplePayload };
  }
};

/**
 * 速報モードか。データがあるときは `mode` に従う。見本データのときだけ `#mode=flash` で切り替えられる
 * （モック画像の撮影用。実データの mode を URL で上書きはしない）
 */
export const isFlash = (hash: string, loaded: Loaded): boolean =>
  loaded.kind === "data" ? loaded.payload.mode === "flash" : hashParam(hash, "mode") === "flash";
