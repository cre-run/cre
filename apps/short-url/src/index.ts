/**
 * Worker の入口。
 * - HTTP: `GET /id/{uuid}`（Cloudflare Access の後ろ）
 * - RPC: `ShortUrl.create(data)`（同じアカウントの Worker から Service Binding で呼ぶ）
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import { createLink, handleRequest } from "./app.ts";
import type { Bindings } from "./env.ts";

/** Bot の wrangler.jsonc: services: [{ binding: "SHORT_URL", service: "<この Worker の name>", entrypoint: "ShortUrl" }] */
export class ShortUrl extends WorkerEntrypoint<Bindings> {
  /** 判定データ（Message Editor の URL の `#d=` より後ろ）を登録し、短縮 URL を返す */
  create(data: string): Promise<{ id: string; url: string }> {
    return createLink(this.env, data);
  }
}

export default {
  fetch: (request, env) => handleRequest(request, env),
} satisfies ExportedHandler<Bindings>;
