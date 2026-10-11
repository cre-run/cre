# @cre/message-editor

Message Editor のモック（SPA）です。返信の下書きを段落ごとに編集しながら、
各段落の確認状況（確認済み・条件あり・再確認・根拠なし）と、根拠（種類・立場・確認日時の鮮度）を表示します。

ドキュメント: `apps/docs/docs/features/message-editor.mdx`（`planned`）

## データの渡し方

バックエンドはなく、画面に渡すデータ（`src/types.ts` の `ReplyReviewPayload`）を JSON にして
pako で圧縮し、base64url で URL の `#d=` に載せます。`#...&p=r3` で最初に選ぶ段落を指定できます。
データがないときは `src/sample.ts` の見本（架空のデータ）を表示します。

```bash
vp run @cre/message-editor#dev                                              # 開発サーバー
vp run @cre/message-editor#encode -- payload.json --base http://localhost:5173/   # JSON から URL を作る
vp run @cre/message-editor#encode                                           # 見本データの URL
vp run @cre/message-editor#test
vp run @cre/message-editor#build
```

## デプロイ

Cloudflare Workers の `cre-editor` として、静的ファイル（`dist/`）を `https://editor.cre.run` で配信します（`wrangler.jsonc`）。

- `main` へ `apps/message-editor` などの変更が push されると、`.github/workflows/deploy-message-editor.yml` がビルドと `wrangler deploy` を実行します。Actions タブから手動実行も可能です
- PR を開くと `.github/workflows/preview-message-editor.yml` が Worker Previews で `pr-<番号>` のプレビューを作り、URL を PR にコメントします。PR を閉じると `preview-cleanup.yml` が削除します
- シークレットは他のアプリと共通の `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を使います
- 判定データは URL の `#` 以降に載るため、サーバー（Cloudflare）には送られません。ただしブラウザの履歴や共有したリンクには残るので、実際の問い合わせ内容を扱う場合は注意してください

## E2E とドキュメントの画像

E2E は Playwright です（`playwright.config.ts`、`e2e/`）。

- `e2e/critical-path.e2e.ts` — 壊れるとガイドの手順が成り立たなくなる操作（画像は撮らない）
- `e2e/guide-message-editor.e2e.ts` — ガイド（`apps/docs/docs/features/message-editor.mdx`）の手順をなぞり、
  ガイドの画像 `apps/docs/docs/features/message-editor*.png` と比べる（VRT）

```bash
vp exec playwright test                # ビルドしてプレビューサーバーを起動し、全 E2E を実行
vp exec playwright test critical-path  # クリティカルパスだけ
```

CI（`.github/workflows/e2e.yml`）は PR と `main` で全 E2E を実行し、画像に差分があれば失敗します。
画面の変更が意図どおりなら、PR に `update-screenshots` ラベルを付けると、CI が画像を撮り直して PR にコミットします
（`.github/workflows/update-screenshots.yml`）。Files changed の画像差分を確認してからマージしてください。

フォントの描画がローカルと CI で違うため、基準画像は CI で撮ったものだけをコミットします
（ローカルで `--update-snapshots` した画像はコミットしない）。
