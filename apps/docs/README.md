# @cre/docs

[Blume](https://useblume.dev/) で構築したドキュメントサイトです。
静的ビルド（`dist/`）を Cloudflare Workers の静的アセットとして `cre-docs` に配信し、カスタムドメイン https://docs.cre.run で公開します。

- `docs/` — ページ（Markdown / MDX）
- `blume.config.ts` — サイト設定
- `public/` — ロゴ・favicon などの静的ファイル
- `wrangler.jsonc` — Worker 名 `cre-docs` の設定

## 開発

```bash
vp run @cre/docs#dev      # ローカルでプレビュー
vp run @cre/docs#build    # dist/ に静的ビルド
vp run @cre/docs#doctor   # 設定とコンテンツをチェック
```

## デプロイ

`main` へ `apps/docs` などの変更が push されると、`.github/workflows/deploy-docs.yml` がビルドと `wrangler deploy` を実行します。
Actions タブから手動実行（workflow_dispatch）も可能です。
シークレットは `apps/lp` と共通の `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を使います。

## PR のプレビュー

`apps/docs` などに変更がある PR を開くと、`.github/workflows/preview-docs.yml` が
[Worker Previews](https://developers.cloudflare.com/workers/previews/)（`wrangler preview`）で `pr-<番号>` のプレビューを作り、URL を PR にコメントします。

- URL は `pr-<番号>-cre-docs.<アカウントの workers.dev サブドメイン>.workers.dev`。プッシュのたびに同じ URL の内容が更新されます
- PR を閉じると、プレビューは削除されます
- フォークからの PR では実行しません（シークレットを渡さないため）
- `workers.dev` のプレビューには `X-Robots-Tag: noindex` が付きます
