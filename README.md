# cre

[Vite+](https://viteplus.dev/) で管理しているモノレポです。

## 構成

- `apps/docs` (`@cre/docs`) — Blume で構築し Cloudflare Workers (`cre-docs`) で配信するドキュメントサイト
- `apps/lp` (`@cre/lp`) — Cloudflare Workers (`cre-lp`) で配信する準備中ページ
- `apps/message-editor` (`@cre/message-editor`) — 返信の段落ごとに根拠を表示する Message Editor のモック（SPA、データは URL の `#d=` で渡す）
- `apps/sample` (`@cre/app-sample`) — Vite アプリの見本
- `packages/sample` (`@cre/sample`) — `vp pack` でビルドするライブラリの見本

## 開発

[Vite+ CLI (`vp`)](https://viteplus.dev/guide/) をインストールした上で:

```bash
vp install         # 依存関係のインストール
vp check           # format + lint + typecheck
vp run -r test     # 全パッケージのテスト
vp run -r build    # 全パッケージのビルド
vp run ready       # 上記をまとめて実行
vp run dev         # apps/sample の開発サーバー
```
