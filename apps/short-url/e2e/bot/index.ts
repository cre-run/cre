/**
 * E2E 専用の Bot。POST の本文（#d= より後ろの値）を、Service Binding の RPC で短縮 URL の Worker に登録する。
 * 呼び出しはガイド apps/docs/docs/short-url/index.mdx「短縮 URL を作る（Bot の開発者向け）」の例と同じ。
 */
interface Env {
  SHORT_URL: { create(data: string): Promise<{ id: string; url: string }> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    try {
      const { id, url } = await env.SHORT_URL.create(await request.text());
      return Response.json({ id, url });
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 400 });
    }
  },
} satisfies ExportedHandler<Env>;
