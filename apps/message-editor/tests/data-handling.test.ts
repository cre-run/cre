/**
 * 対応ガイド: apps/docs/docs/message-editor/data-handling.mdx「確かめ方」
 * （README「セキュリティとプライバシー」も同じ約束）。ブラウザを使わず、コードの形で確かめる。
 * - 判定データをサーバーや外部サービスに送らない（fetch などを使わない）
 * - ブラウザに保存しない（localStorage などを使わない）
 * - 外部スクリプト・解析タグを読み込まない。検索エンジンに載せない（noindex）
 * - README・ガイドに書いた encode の手順が、書いてあるとおりに動く
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { decodePayload } from "../src/payload.ts";
import { samplePayload } from "../src/sample.ts";

const APP = fileURLToPath(new URL("..", import.meta.url));
const README = join(APP, "README.md");
const GUIDE = join(APP, "../docs/docs/message-editor/index.mdx");

const sourceFiles = (): string[] =>
  readdirSync(join(APP, "src"), { recursive: true, encoding: "utf8" })
    .filter((name) => /\.(ts|tsx|css)$/u.test(name))
    .map((name) => join("src", name));

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
