/**
 * 対応する場所: リポジトリの README.md の先頭の画像（.github/assets/readme-hero.png）
 *
 * Message Editor の画面をブラウザ風の枠に入れ、ブランドの色の背景に載せて撮る。ガイドの画像と同じく、
 * 基準の画像は CI のコンテナで撮ったものだけをコミットし（`update-screenshots` ラベル）、画面が変わったら差分で落とす。
 * 画像の大きさは playwright.config.ts の readme プロジェクトの viewport で決める。
 */
import { expect, test } from "@playwright/test";

// 画面は 1440px 幅（ガイドの画像と同じ）で描き、0.8 倍に縮めて枠に入れる
const EDITOR_WIDTH = 1440;
const SCALE = 0.8;

test("README の画像: 再確認が必要な段落で「評価」タブを開いたところ", async ({ page, baseURL }) => {
  const viewport = page.viewportSize();
  if (!viewport || !baseURL) throw new Error("viewport と baseURL が必要です");
  const inset = 64;
  const chromeHeight = 44;
  const windowWidth = viewport.width - inset * 2;
  const frameHeight = viewport.height - inset - chromeHeight;
  expect(windowWidth).toBe(EDITOR_WIDTH * SCALE);

  await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; background: transparent; }
      .stage {
        position: relative;
        width: ${viewport.width}px;
        height: ${viewport.height}px;
        overflow: hidden;
        border-radius: 28px;
        background:
          radial-gradient(circle at 18% -10%, rgb(66 214 164 / 0.42), transparent 46%),
          radial-gradient(circle at 105% 110%, rgb(66 214 164 / 0.22), transparent 42%),
          linear-gradient(160deg, #0c2b5c, #071b3d 62%);
      }
      .window {
        position: absolute;
        top: ${inset}px;
        left: ${inset}px;
        width: ${windowWidth}px;
        overflow: hidden;
        border: 1px solid rgb(255 255 255 / 0.16);
        border-bottom: 0;
        border-radius: 14px 14px 0 0;
        background: #ffffff;
        box-shadow: 0 32px 80px rgb(0 0 0 / 0.45);
      }
      .chrome {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        height: ${chromeHeight}px;
        padding: 0 18px;
        border-bottom: 1px solid #e6e8e3;
        background: #f4f5f2;
      }
      .chrome i {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #d6d9d3;
      }
      .url {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        padding: 4px 56px;
        border-radius: 8px;
        background: #ffffff;
        color: #5b6470;
        font: 500 13px/1.4 system-ui, sans-serif;
        letter-spacing: 0.02em;
      }
      .viewport {
        height: ${frameHeight}px;
        overflow: hidden;
      }
      iframe {
        display: block;
        width: ${EDITOR_WIDTH}px;
        height: ${frameHeight / SCALE}px;
        border: 0;
        transform: scale(${SCALE});
        transform-origin: 0 0;
      }
    </style>
  </head>
  <body>
    <div class="stage">
      <div class="window">
        <div class="chrome"><i></i><i></i><i></i><span class="url">editor.cre.run</span></div>
        <div class="viewport"><iframe src="${baseURL}/#p=r3" title="Message Editor"></iframe></div>
      </div>
    </div>
  </body>
</html>`);

  const editor = page.frameLocator("iframe");
  const panel = editor.getByRole("complementary");
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("データの保存期間と削除");
  await panel.getByRole("tab", { name: /評価/u }).click();
  await expect(panel.getByText("実装との一致")).toBeVisible();
  // 枠の外（角丸の外側）は透明にして、GitHub のライト・ダークどちらの背景にもなじませる
  await expect(page).toHaveScreenshot("readme-hero.png", { omitBackground: true });
});
