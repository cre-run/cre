# @cre/docs

[Blume](https://useblume.dev/) で構築したドキュメントサイトです。
静的ビルド（`dist/`）を Cloudflare Workers の静的アセットとして `cre-docs` に配信します。

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
