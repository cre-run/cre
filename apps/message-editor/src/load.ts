import { decodePayload, readHash, type ReplyReviewPayload } from "@cre/editor-payload";
import { samplePayload } from "./sample.ts";

export type Loaded =
  | { kind: "data"; payload: ReplyReviewPayload }
  | { kind: "sample"; payload: ReplyReviewPayload }
  | { kind: "error"; message: string; payload: ReplyReviewPayload };

export const hashParam = (hash: string, key: string): string | null =>
  new URLSearchParams(hash.replace(/^#/u, "")).get(key);

export const load = (hash: string): Loaded => {
  const encoded = readHash(hash);
  if (!encoded) {
    return { kind: "sample", payload: samplePayload };
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
