/**
 * 対応ガイド: apps/docs/docs/message-editor/data-handling.mdx「確かめ方」
 * （README「セキュリティとプライバシー」も同じ約束）。ブラウザを使わず、コードの形で確かめる。
 * - 判定データをサーバーや外部サービスに送らない（fetch などを使わない）
 * - ブラウザに保存しない（localStorage などを使わない）
 * - 外部スクリプト・解析タグを読み込まない。検索エンジンに載せない（noindex）
 * - README・ガイドに書いた encode の手順が、書いてあるとおりに動く
 * - 形式が合わない・http(s) 以外のリンク・大きすぎるデータを受け付けない
 * 約束のテストはこのファイルと e2e/guide-message-editor-data-handling.e2e.ts にだけ置く
 * （ガイドの tested バッジと tests/guide-promises.test.ts が突き合わせる）。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import {
  MAX_DECODED_BYTES,
  MAX_ENCODED_LENGTH,
  decodePayload,
  encodePayload,
  isPayload,
} from "@cre/message-payload";
import { samplePayload } from "../src/sample.ts";

const APP = fileURLToPath(new URL("..", import.meta.url));
const README = join(APP, "README.md");
const GUIDE = join(APP, "../docs/docs/message-editor/index.mdx");

/** 画面のコードと、画面にバンドルされる共有パッケージ（@cre/message-payload）の両方を走査する */
const SOURCE_ROOTS = ["src", "../../packages/message-payload/src"];
const sourceFiles = (): string[] =>
  SOURCE_ROOTS.flatMap((root) =>
    readdirSync(join(APP, root), { recursive: true, encoding: "utf8" })
      .filter((name) => /\.(ts|tsx|css)$/u.test(name))
      .map((name) => join(root, name)),
  );

/** 使っていたら「送らない・保存しない」が崩れる API。必要になったらガイドを直してから外す */
const FORBIDDEN: Record<string, RegExp> = {
  "サーバーへの送信（fetch）": /\bfetch\s*\(/u,
  "サーバーへの送信（XMLHttpRequest）": /XMLHttpRequest/u,
  "サーバーへの送信（sendBeacon）": /sendBeacon/u,
  "サーバーへの送信（WebSocket / EventSource）": /\b(WebSocket|EventSource)\b/u,
  "ブラウザへの保存（Web Storage）": /\b(localStorage|sessionStorage)\b/u,
  "ブラウザへの保存（IndexedDB / Cache）": /\b(indexedDB|caches\.open)\b/u,
  "ブラウザへの保存（Cookie）": /document\.cookie/u,
  "HTML の直接挿入（XSS の入口）": /dangerouslySetInnerHTML|\.innerHTML\b/u,
};

test("画面のコードは、判定データを送信・保存する API を使っていない", () => {
  const files = sourceFiles();
  expect(files.length).toBeGreaterThan(5);
  for (const file of files) {
    const text = readFileSync(join(APP, file), "utf8");
    for (const [reason, pattern] of Object.entries(FORBIDDEN)) {
      expect(text, `${file}: ${reason}`).not.toMatch(pattern);
    }
  }
});

test("index.html は自前のスクリプトだけを読み込み、検索エンジンには載せない", () => {
  const html = readFileSync(join(APP, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*>/gu)].map((m) => m[0]);
  expect(scripts).toEqual(['<script type="module" src="/src/main.tsx">']);
  // 外部の CSS・フォント・解析タグも読み込まない
  expect(html).not.toMatch(/\b(src|href)=["'](https?:)?\/\//u);
  expect(html).toMatch(/<meta name="robots" content="noindex" \/>/u);
});

test("README・ガイドの手順どおりに encode を実行すると、--base を付けた URL ができる", () => {
  const dir = mkdtempSync(join(tmpdir(), "cre-encode-"));
  const file = join(dir, "payload.json");
  const payload = {
    ...samplePayload,
    inquiry: { ...samplePayload.inquiry, subject: "encode のテスト用の件名" },
  };
  writeFileSync(file, JSON.stringify(payload));
  const base = "https://editor.cre.run/";
  const url = execFileSync(process.execPath, ["scripts/encode.ts", file, "--base", base], {
    cwd: APP,
    encoding: "utf8",
  }).trim();
  expect(url.startsWith(`${base}#d=`)).toBe(true);
  expect(decodePayload(url.slice(`${base}#d=`.length))).toEqual(payload);
});

test("ドキュメントの encode の例は vp run を使わない（出力をキャッシュして古い URL を返すため）", () => {
  for (const doc of [README, GUIDE]) {
    const text = readFileSync(doc, "utf8");
    expect(text, doc).toContain("node scripts/encode.ts");
    expect(text, doc).not.toMatch(/vp run \S*#encode/u);
  }
});

test("形式の違うデータは読み込まない", () => {
  const broken = encodePayload({ ...samplePayload, version: 2 as 1 });
  expect(() => decodePayload(broken)).toThrow();
  expect(() => decodePayload("not-a-payload")).toThrow();
});

test("入れ子の必須項目や値が不正なデータは読み込まない", () => {
  const { inquiry, reply } = samplePayload;
  const [first, ...rest] = reply.paragraphs;
  const withoutFrom = { ...samplePayload, inquiry: { ...inquiry, from: undefined } };
  const withoutEvidence = {
    ...samplePayload,
    reply: { ...reply, paragraphs: [{ ...first, evidence: undefined }, ...rest] },
  };
  const unknownStatus = {
    ...samplePayload,
    reply: { ...reply, paragraphs: [{ ...first, status: "done" }, ...rest] },
  };
  const invalidDate = { ...samplePayload, generatedAt: "x" };
  const invalidCheckedAt = {
    ...samplePayload,
    reply: {
      ...reply,
      paragraphs: [{ ...first, evidence: [{ ...first.evidence[0], checkedAt: "昨日" }] }, ...rest],
    },
  };
  const duplicateIds = {
    ...samplePayload,
    reply: { ...reply, paragraphs: [first, { ...rest[0], id: first.id }, ...rest.slice(1)] },
  };
  const danglingRef = {
    ...samplePayload,
    reply: { ...reply, paragraphs: [{ ...first, respondsTo: ["q9"] }, ...rest] },
  };
  const duplicateInquiryIds = {
    ...samplePayload,
    inquiry: {
      ...inquiry,
      paragraphs: inquiry.paragraphs.map((p, i) => (i === 1 ? { ...p, id: "q1" } : p)),
    },
  };
  for (const data of [
    danglingRef,
    duplicateInquiryIds,
    withoutFrom,
    withoutEvidence,
    unknownStatus,
    invalidDate,
    invalidCheckedAt,
    duplicateIds,
  ]) {
    expect(isPayload(data)).toBe(false);
    expect(() => decodePayload(encodePayload(data as typeof samplePayload))).toThrow();
  }
  expect(isPayload(samplePayload)).toBe(true);
});

test("根拠のリンクは http(s) だけを受け付ける", () => {
  const { reply } = samplePayload;
  const [first, ...rest] = reply.paragraphs;
  const withUrl = (url: string) => ({
    ...samplePayload,
    reply: {
      ...reply,
      paragraphs: [{ ...first!, evidence: [{ ...first!.evidence[0]!, url }] }, ...rest],
    },
  });
  for (const url of ["https://example.com/terms", "http://intranet/rules#3"]) {
    expect(isPayload(withUrl(url)), url).toBe(true);
  }
  for (const url of [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "//example.com/terms",
    "規約を参照",
  ]) {
    expect(isPayload(withUrl(url)), url).toBe(false);
    expect(() => decodePayload(encodePayload(withUrl(url)))).toThrow();
  }
});

test("大きすぎる圧縮データは展開しない", () => {
  expect(encodePayload(samplePayload).length).toBeLessThan(MAX_ENCODED_LENGTH / 10);
  expect(() => decodePayload("A".repeat(MAX_ENCODED_LENGTH + 1))).toThrow(/大きすぎます/u);
});

test("展開すると大きくなるデータ（展開爆弾）は、途中で打ち切る", () => {
  expect(JSON.stringify(samplePayload).length).toBeLessThan(MAX_DECODED_BYTES / 10);
  // 同じ文字の繰り返しは数百分の 1 に縮むので、圧縮後は短くても展開後は上限を大きく超える
  const bomb = {
    ...samplePayload,
    inquiry: { ...samplePayload.inquiry, subject: "a".repeat(MAX_DECODED_BYTES * 50) },
  };
  const encoded = encodePayload(bomb);
  expect(encoded.length).toBeLessThan(MAX_ENCODED_LENGTH);
  const started = performance.now();
  expect(() => decodePayload(encoded)).toThrow(/大きすぎます（展開後/u);
  // 全部展開してから落とすのではなく、上限を超えた時点でやめている
  expect(performance.now() - started).toBeLessThan(500);
});
