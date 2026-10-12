import { defineConfig, devices } from "@playwright/test";
import { PORTS } from "./e2e/ports.ts";

/**
 * 短縮 URL の E2E。ローカルで 4 つのサーバーを立てて、ガイドの流れをなぞる。
 * - Access の代わり（scripts/dev-access.ts）: 公開鍵を返す。テストは同じ鍵で JWT を作り、ヘッダーに付けて開く
 * - 短縮 URL の Worker（wrangler dev）: 設定は .dev.vars.example をそのまま使う。D1 は .wrangler/e2e に置く
 * - E2E 専用の Bot の Worker（e2e/bot）: Service Binding の RPC で create() を呼ぶ
 * - Message Editor（apps/message-editor のビルドとプレビュー）: 302 の転送先
 *
 * 画像は撮らない（短縮 URL の画面は固定の文言だけで、移った先は Message Editor のガイドで撮っている）。
 */
const PERSIST = "--persist-to .wrangler/e2e";

/**
 * wrangler dev は、同じマシンの Service Binding をつなぐための登録（~/.config/.wrangler/registry）を、
 * SIGINT で終わるときにだけ消す。既定の止め方（強制終了）だと古い登録が残り、次の実行で Bot の create() が
 * 「Network connection lost」で落ちるので、Ctrl+C と同じ止め方にする
 */
const WRANGLER_SHUTDOWN = { signal: "SIGINT", timeout: 10_000 } as const;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORTS.shortUrl}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // ローカルで別途入っている Chromium を使う場合に指定する（CI では不要）
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: `node scripts/dev-access.ts serve --port ${PORTS.access}`,
      url: `http://localhost:${PORTS.access}/cdn-cgi/access/certs`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `vp exec wrangler d1 migrations apply cre-short --local ${PERSIST} && vp exec wrangler dev --port ${PORTS.shortUrl} --env-file .dev.vars.example ${PERSIST}`,
      // 応答は 404・503 の固定の画面なので（url の待ち受けは 2xx・3xx・400〜403 だけ）、ポートで待つ
      port: PORTS.shortUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      gracefulShutdown: WRANGLER_SHUTDOWN,
    },
    {
      command: `vp exec wrangler dev --config e2e/bot/wrangler.jsonc --port ${PORTS.bot}`,
      port: PORTS.bot,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      gracefulShutdown: WRANGLER_SHUTDOWN,
    },
    {
      command: `vp build && vp preview --port ${PORTS.editor} --strictPort`,
      cwd: "../message-editor",
      url: `http://localhost:${PORTS.editor}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
