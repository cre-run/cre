import { readFileSync } from "node:fs";

const guide = (page: string) => new URL(`../../docs/docs/message-editor/${page}`, import.meta.url);

/** ガイドに載せた `https://editor.cre.run/#d=...` の圧縮データをすべて取り出す */
export const guideExampleHashes = (page = "index.mdx"): string[] =>
  [...readFileSync(guide(page), "utf8").matchAll(/https:\/\/editor\.cre\.run\/#d=([\w-]+)/gu)].map(
    (match) => match[1]!,
  );
