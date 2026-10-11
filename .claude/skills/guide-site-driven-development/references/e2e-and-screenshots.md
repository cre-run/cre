# E2E とガイドの画像（このリポジトリの決めごと）

ガイド・E2E・クリティカルパスの役割を分け、どれかが壊れたら CI で気づけるようにする。

## 3 つの層

| 層                 | 置き場所（例: Message Editor）          | 守るもの                                     | 失敗したとき                                       |
| ------------------ | --------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| クリティカルパス   | `apps/<app>/e2e/critical-path.e2e.ts`   | 壊れるとガイドの手順が成り立たなくなる操作   | 実装を直す                                         |
| ガイドの E2E + VRT | `apps/<app>/e2e/guide-<page>.e2e.ts`    | ガイドの手順と画像が、今の画面と一致すること | 意図しない差分は実装を直す。意図した差分は撮り直す |
| 単体テスト         | `apps/<app>/src/**/*.test.ts`（Vitest） | データの変換・判定などのロジック             | 実装を直す                                         |

- クリティカルパスは画像を撮らず、テキストと役割（role・ラベル）で速く確かめる
- ガイドの E2E は、ガイドの手順（Step）と 1:1 で対応させる。ファイルの先頭に対応するガイドのパスを書く
- ガイドの画像は E2E の `toHaveScreenshot` が撮り、ガイドの隣（`apps/docs/docs/features/*.png`）に置いたものを
  そのまま比較の基準にする（`playwright.config.ts` の `snapshotPathTemplate`）。別の場所にコピーしない

## CI

- `.github/workflows/e2e.yml` — PR と `main` で全 E2E を実行する。画像に差分があれば **失敗** する
- `.github/workflows/update-screenshots.yml` — PR に `update-screenshots` ラベルを付けると、ガイドの画像を撮り直し、
  全 E2E が通ったときだけ PR のブランチにコミットする。結果は PR にコメントされ、ラベルは自動で外れる
- どちらも Playwright の公式コンテナ（`@playwright/test` と同じバージョン）に `fonts-noto-cjk` を入れて実行する。
  ローカルとはフォントの描画が違うので、**基準画像は CI で撮ったものだけをコミットする**

## AI が守ること

- 画像の差分で E2E が落ちたら、まず差分画像（Actions の `playwright-report` / `test-results`）を見て、意図した変更かを判断する
- 意図した変更なら、人に「`update-screenshots` ラベルで撮り直してよいか」を確認する。勝手にラベルを付けない
- ローカルで `--update-snapshots` した画像をコミットしない（CI と描画が違い、次の CI で落ちる）
- 画面を変えたら、ガイドの文章（手順・ラベル名）も合っているかを確かめ、ずれていれば人に提案する
- 閾値（`maxDiffPixelRatio`）を緩めて通さない。緩める必要があれば理由を添えて人に提案する

## ローカルでの実行

```bash
cd apps/message-editor
vp exec playwright test                # ビルドしてプレビューサーバーを起動し、全 E2E を実行
vp exec playwright test critical-path  # クリティカルパスだけ
```

ローカルではフォントの違いでガイドの画像の比較が落ちることがある。クリティカルパスが通れば十分で、画像は CI で確かめる。
