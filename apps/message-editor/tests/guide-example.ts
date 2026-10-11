import { readFileSync } from "node:fs";

const GUIDE = new URL("../../docs/docs/features/message-editor.mdx", import.meta.url);

/** ガイドに載せた `https://editor.cre.run/#d=...` の圧縮データをすべて取り出す */
export const guideExampleHashes = (): string[] =>
  [...readFileSync(GUIDE, "utf8").matchAll(/https:\/\/editor\.cre\.run\/#d=([\w-]+)/gu)].map(
    (match) => match[1]!,
  );
