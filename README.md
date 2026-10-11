# cre

[Vite+](https://viteplus.dev/) で管理しているモノレポです。

## 構成

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
