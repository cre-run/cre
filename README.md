# cre

[Vite+](https://viteplus.dev/) で管理しているモノレポです。

## 構成

- `apps/docs` (`@cre/docs`) — Blume で構築し Cloudflare Workers (`cre-docs`) で配信するドキュメントサイト
- `apps/lp` (`@cre/lp`) — Cloudflare Workers (`cre-lp`) で配信する準備中ページ
- `apps/message-editor` (`@cre/message-editor`) — 返信の段落ごとに根拠を表示する Message Editor のモック（SPA、データは URL の `#d=` で渡す）。Cloudflare Workers (`cre-editor`) で `editor.cre.run` に配信
- `apps/short-url` — （実装中・デプロイ準備中）Message Editor 専用の短縮 URL サービス。Cloudflare Workers (`cre-short`) + D1 で、セルフホストして使う。設計は `apps/short-url/README.md`
- `apps/sample` (`@cre/app-sample`) — Vite アプリの見本
- `packages/guide-promises` (`@cre/guide-promises`) — 約束のガイドの「テスト」列のバッジと実際のテストを突き合わせる道具。各アプリの `tests/guide-promises.test.ts` から使う
- `packages/editor-payload` (`@cre/editor-payload`) — Message Editor の判定データの型と、URL の `#d=` に載せる圧縮・展開・検証。Message Editor と短縮 URL で共有する
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

## AI エージェント

Claude Code・Codex 向けの内部ガイドは [AGENTS.md](AGENTS.md) にあります。`CLAUDE.md` は `@AGENTS.md` を読み込むだけなので、内容は `AGENTS.md` に書いてください。
チーム共通の Claude Code の設定は `.claude/settings.json`（応答は日本語）です。個人の設定は `.claude/settings.local.json` に書いてください。
