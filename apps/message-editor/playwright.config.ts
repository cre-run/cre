import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * E2E は 2 種類。
 * - e2e/critical-path.e2e.ts: 壊れたら困る操作の確認（毎回の PR で実行）
 * - e2e/guide-*.e2e.ts: ガイドの手順を 1:1 でなぞり、ガイドの画像を撮って比較する（VRT）
 *
 * ガイドの画像は apps/docs/docs/message-editor/ に直接置き、それを比較の基準にする。
 * 基準の更新は CI の update-screenshots（PR に `update-screenshots` ラベル）でのみ行い、人がマージで承認する。
 * フォントなどの差をなくすため、基準画像は CI のコンテナ（.github/workflows/e2e.yml）で撮る。
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  // ガイドの画像を {arg}.png として apps/docs のガイドの隣に置く
  snapshotPathTemplate: "../docs/docs/message-editor/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: {
    toHaveScreenshot: {
      // 基準画像は同じコンテナで撮るので差はほぼ出ない。ボタンの色の変化（全体の約 0.4%）も検知できるよう 0.1% までに絞る
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      caret: "hide",
      // ガイドの画像はデバイスピクセル比 2 で撮る（既定の "css" だと 1 倍になる）
      scale: "device",
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // ガイドの画像と同じ大きさ（README の撮影条件と合わせる）
        viewport: { width: 1440, height: 1700 },
        deviceScaleFactor: 2,
        // ローカルで別途入っている Chromium を使う場合に指定する（CI では不要）
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: {
    command: `vp build && vp preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
