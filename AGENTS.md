# AGENTS.md

Claude Code・Codex など、このリポジトリで作業する AI エージェント向けの内部ガイド。
構成と基本のコマンドは [README.md](README.md) を見る。ここには、それ以外で知っておくべきことだけを書く。

## 進め方

- やり取り・PR の本文・ドキュメントは日本語で書く。コミットメッセージは Conventional Commits（`feat(scope): ...` など）
- ユーザーに見える機能やガイドに関わる作業では、スキル `guide-site-driven-development` に従う
  - 実体は `.claude/skills/`、Codex 用の `.agents/skills/` はそこへのシンボリックリンク。編集は実体側で行う
  - E2E と画像のルール: `.claude/skills/guide-site-driven-development/references/e2e-and-screenshots.md`
- PR を出す前に `vp run ready`（check・test・build）を通す。E2E に関わる変更では、クリティカルパスもローカルで流す
- Codex などのレビュー指摘は、実際に起きるかを確かめてから直す。起きない・割に合わないときは、根拠を返信して人に判断を仰ぐ

## 公開リポジトリとしての注意

このリポジトリは public。顧客名・商談・価格の検討・採用計画・競合分析の結論、非公開リポジトリ `cre-private` の内容や `CONFIDENTIAL` の印が付いた文書の文章は、コード・ドキュメント・コミットメッセージ・PR 本文・Issue のどれにも書かない。迷ったら書かずに人に確認する。

push 前に `.githooks/pre-push` が、push する差分（追加行。push 先に既にある行には `[公開済み]` の印が付く）とコミットメッセージを安価なモデル（既定は `claude -p --model claude-haiku-5-5`。`CRE_PUSH_REVIEWER=codex` で codex CLI）に読ませ、怪しければ理由を表示して人に確認を求める。端末が無い AI エージェントの実行では push が止まるので、人に報告して判断を仰ぐ。`CRE_PUSH_REVIEWED=1` と `--no-verify` は人だけが使う。AI は使わない。有効化は `vp install`（`core.hooksPath` を設定する）。

## コマンドの注意点

- `vp run` は環境変数をほとんど引き継がず、結果をキャッシュする（`run.cache: true`）
  - シークレットが必要なコマンド（`wrangler deploy` など）は `vp exec wrangler ...` で直接実行する
- 依存関係は pnpm（`devEngines` で 12.11.2）。`pnpm-workspace.yaml` の `minimumReleaseAge` で **公開から 3 日未満の版は入れられない**
  - lockfile の検証でも落ちるので、新しすぎる版は 1 つ前に下げる。共通の版は `catalog:` で揃える
  - 依存の更新は Renovate（`renovate.json`）。`minimumReleaseAge` を同じ 3 日にしている。片方を変えるときはもう片方も揃える
- ビルド時にスクリプトを実行してよいパッケージは `allowBuilds` に列挙している（esbuild・workerd）

## Cloudflare Workers

| アプリ                             | Worker       | 本番                                   | PR ごとのプレビュー                     |
| ---------------------------------- | ------------ | -------------------------------------- | --------------------------------------- |
| `apps/lp`                          | `cre-lp`     | （準備中ページ）                       | なし                                    |
| `apps/docs`                        | `cre-docs`   | `https://docs.cre.run`                 | `pr-<番号>-cre-docs.toy0.workers.dev`   |
| `apps/message-editor`              | `cre-editor` | `https://editor.cre.run`               | `pr-<番号>-cre-editor.toy0.workers.dev` |
| `apps/short-url`（デプロイ準備中） | `cre-short`  | （準備中。予定は `https://s.cre.run`） | なし（プロトタイプのあいだは作らない）  |

- 本番は `main` への push で `deploy-*.yml` がデプロイする。シークレットは `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
- プレビューは Worker Previews（`wrangler preview`）。共通処理は `_preview-worker.yml`、PR を閉じたときの削除は `preview-cleanup.yml`
  - `preview_urls` は本番デプロイ（`wrangler deploy`）で反映される。新しい Worker では、先に本番へ一度デプロイする
  - 削除時の API エラー `10025`（Preview not found）は正常扱い。それ以外の失敗はジョブを落とす
  - フォークと Dependabot の PR ではシークレットが使えないので、プレビュー系のジョブは実行しない

## E2E（Playwright）

- `apps/message-editor` で `vp exec playwright test`（ビルドしてプレビューサーバーを起動する）。`critical-path` だけでも流せる
- Claude Code のクラウドのセッションでは Playwright のブラウザをダウンロードせず、入っている Chromium を指定する

  ```bash
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium vp exec playwright test
  ```

- ガイドの画像（VRT の基準）は **CI で撮ったものだけ** をコミットする。ローカルとはフォントの描画が違う
  - 撮り直しは PR に `update-screenshots` ラベルを付ける。付けてよいかは人に確認する

## やってはいけないこと

- テストを skip・削除したり、VRT の閾値を緩めたりして CI を通す
- ローカルで `--update-snapshots` した画像をコミットする
- `planned` / `preview` のバッジを人の合意なしに進めたり外したりする
