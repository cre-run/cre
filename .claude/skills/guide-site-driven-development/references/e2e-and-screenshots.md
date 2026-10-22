# E2E とガイドの画像（このリポジトリの決めごと）

ガイド・E2E・クリティカルパスの役割を分け、どれかが壊れたら CI で気づけるようにする。

## 4 つの層

| 層                 | 置き場所（例: Message Editor）                                  | 守るもの                                                   | 失敗したとき                                             |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| クリティカルパス   | `apps/<app>/e2e/critical-path.e2e.ts`                           | 壊れるとガイドの手順が成り立たなくなる操作                 | 実装を直す                                               |
| ガイドの E2E + VRT | `apps/<app>/e2e/guide-<app>[-<page>].e2e.ts`                    | ガイドの手順と画像が、今の画面と一致すること               | 意図しない差分は実装を直す。意図した差分は撮り直す       |
| 約束のテスト       | `apps/<app>/tests/*.test.ts` と `e2e/guide-<app>-<page>.e2e.ts` | ガイドで約束したこと（送らない・残さない、など）を守ること | 実装を直す。約束を変えるなら、先にガイドを直して人と合意 |
| 単体テスト         | `apps/<app>/tests/*.test.ts`（Vitest）                          | データの変換・判定などのロジック                           | 実装を直す                                               |

- クリティカルパスは画像を撮らず、テキストと役割（role・ラベル）で速く確かめる
- ガイドの E2E は、ガイドの手順（Step）と 1:1 で対応させる。ファイルの先頭に対応するガイドのパスを書く。
  画像を撮らないガイド（約束の一覧など）の E2E も同じ名前の規則にし、撮らない理由を先頭に書く
- ガイドの画像は E2E の `toHaveScreenshot` が撮り、ガイドの隣（`apps/docs/docs/<app>/*.png`）に置いたものを
  そのまま比較の基準にする（`playwright.config.ts` の `snapshotPathTemplate`）。別の場所にコピーしない
- リポジトリの README.md の先頭の画像も同じ仕組みで撮る。`apps/message-editor/e2e/readme.e2e.ts` が画面を枠に入れて撮り、
  `.github/assets/readme-hero.png` を比較の基準にする（`playwright.config.ts` の `readme` プロジェクト）。
  ガイドの画像と一緒に `update-screenshots` ラベルで撮り直す
- 約束のガイドでは、約束を表にし、「テスト」列にテストへリンクするバッジを置く（1 つの約束に複数可、
  同じテストを複数の約束に付けない。2 つの約束を 1 つのテストで確かめているなら、テストを分ける。表示は `E2E` か `単体`）:
  `<a href="https://github.com/cre-run/cre/blob/main/apps/<app>/<file>#L<テストの宣言行>"><Badge variant="success" size="xs">E2E</Badge></a>`。
  約束のテストは約束専用のファイル（`tests/data-handling.test.ts`・`e2e/guide-<app>-<page>.e2e.ts`）にだけ置き、
  `tests/guide-promises.test.ts` が、リンク先の行にテストの宣言があること、約束専用ファイルのテストにすべてバッジがあることを
  突き合わせる（バッジを外す・テストの行がずれる・テストを足す・skip する、のどれでも落ち、正しい `#L<行>` を表示する）。
  テストしない約束は「テスト」列を `—` にし、その理由を「確かめ方」に書く

## ガイドの置き場（`apps/docs/docs/`）

アプリごとに 1 ディレクトリ。アプリが増えても同じ形で足す。

| ファイル           | 役割                                              | 対応する E2E                     |
| ------------------ | ------------------------------------------------- | -------------------------------- |
| `<app>/meta.ts`    | サイドバーのグループ名（`defineMeta({ title })`） | —                                |
| `<app>/index.mdx`  | 概要と画面の見方（`/<app>`）                      | `e2e/guide-<app>.e2e.ts`         |
| `<app>/<page>.mdx` | 機能・約束ごとのページ（`/<app>/<page>`）         | `e2e/guide-<app>-<page>.e2e.ts`  |
| `<app>/*.png`      | ガイドの画像（VRT の基準）                        | `toHaveScreenshot("<name>.png")` |

- ページを動かしたら、`blume.config.ts` の `redirects` に古い URL からの転送を足す（公開済みの URL を壊さない）
- サイドバーの表示名は frontmatter の `sidebar.label` で付ける（`index.mdx` は「使い方」など。グループ名とページ名を重複させない）
- 例: `message-editor/index.mdx`・`message-editor/data-handling.mdx`・`message-editor/*.png`

## CI

- `.github/workflows/e2e.yml` — PR と `main` で全 E2E を実行する。画像に差分があれば **失敗** する
- `.github/workflows/update-screenshots.yml` — PR に `update-screenshots` ラベルを付けると、ガイドと README の画像を撮り直し、
  全 E2E が通ったときだけ PR のブランチにコミットする。結果は PR にコメントされ、ラベルは自動で外れる
  - 撮り直しは `--update-snapshots=all` で全画像を上書きする。比較の閾値（`maxDiffPixelRatio`）未満の小さな変化
    （ヘッダのバッジなど）は E2E では落ちないため、比較に落ちた画像だけを上書きすると古い画像が残る
  - コメントは失敗したステップ（撮り直し・E2E・push など）を名指しする。実行中にブランチへ push があって
    push が拒否されたときは、確かめていないコードに画像を載せないよう rebase せずに止める。ラベルを付け直して撮り直す
  - ボットのコミットで起きる PR のワークフローは承認待ちで止まるため、コミット後に CI・E2E・ドキュメントのプレビューを
    `workflow_dispatch` で呼び出し直す（承認しなくてもチェックとプレビューがそろう）
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
