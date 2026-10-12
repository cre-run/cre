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

このリポジトリは public。次のものは書かない（コード・ドキュメント・コミットメッセージ・PR 本文・Issue のすべて）。

- 顧客名・見込み顧客・商談・売上・価格の検討、採用計画、競合分析の結論
- 非公開リポジトリ `cre-private` の内容。引用も要約もしない。必要なら「内部資料に基づく」とだけ書く
- `CONFIDENTIAL` の印が付いた文書の文章、非公開パッケージ（スコープ `@cre-internal`）への依存や import

迷ったら書かずに人に確認する。機械は 2 段で止める。

- 確定的な印の検査 `scripts/check-confidential.mjs`: 機密の印・`cre-private` への組織名付きの参照・`@cre-internal` スコープ・`visibility: private`。3 か所から呼ばれる
  - AI エージェントの hooks: Claude Code は `.claude/settings.json`、Codex は `.codex/hooks.json`（初回は Codex で `/hooks` を開いて信頼する。プロジェクトを信頼していないと読まれない）。Write / Edit / apply_patch の内容と `git commit` の前に止める。git の hook を迂回するコマンド（`--no-verify`、`core.hooksPath`、下の `CRE_PUSH_*` を付けた push）も拒否する
  - git の hooks（`.githooks/`）: pre-commit と commit-msg。`vp install` が `core.hooksPath` を設定する。手動なら `git config core.hooksPath .githooks`
  - CI の `confidential` ジョブ（`confidential.yml`、`pull_request_target`）: 追跡中の全ファイル、PR の題名・本文、コミットメッセージと各コミットの追加行。検査スクリプトとワークフロー定義は base のものが使われ、PR の head はコードを実行せず別ディレクトリで走査する
- push 前の AI レビュー `scripts/review-push.mjs`（`.githooks/pre-push`）: push するコミットのメッセージと追加行を安価なモデルに読ませ、顧客名・商談・価格・採用・内部構成などがあれば理由を表示して人に確認を求める。端末があれば y/N、無ければ push を止める
  - レビュアーは `claude` CLI（`-p --model claude-haiku-5-5`、ツール無効）か `codex` CLI（`exec --sandbox read-only`、`--output-schema` で JSON を強制）。入っている方を使い、両方あれば claude。`CRE_PUSH_REVIEWER=claude|codex`、`CRE_PUSH_REVIEW_MODEL` で変えられる
  - 人が確かめて push すると決めたときだけ、**人が** 端末で y と答えるか `CRE_PUSH_REVIEWED=1 git push` を実行する。AI エージェントはこれを付けない（Claude Code と Codex は hook で拒否される）。`CRE_PUSH_REVIEWER=off` も同じ
  - 一度「要確認」になったコミットは、push をやり直しても同じ指摘で止まる。push するタグの名前と注釈付きタグのメッセージも対象
  - 確定的な印に引っかかったコミットは、人の確認でも通さない。コミットを直す

## コマンドの注意点

- `vp run` は環境変数をほとんど引き継がず、結果をキャッシュする（`run.cache: true`）
  - シークレットが必要なコマンド（`wrangler deploy` など）は `vp exec wrangler ...` で直接実行する
- 依存関係は pnpm（`devEngines` で 12.11.2）。`pnpm-workspace.yaml` の `minimumReleaseAge` で **公開から 3 日未満の版は入れられない**
  - lockfile の検証でも落ちるので、新しすぎる版は 1 つ前に下げる。共通の版は `catalog:` で揃える
  - 依存の更新は Renovate（`renovate.json`）。`minimumReleaseAge` を同じ 3 日にしている。片方を変えるときはもう片方も揃える
- ビルド時にスクリプトを実行してよいパッケージは `allowBuilds` に列挙している（esbuild・workerd）

## Cloudflare Workers

| アプリ                | Worker       | 本番                     | PR ごとのプレビュー                     |
| --------------------- | ------------ | ------------------------ | --------------------------------------- |
| `apps/lp`             | `cre-lp`     | （準備中ページ）         | なし                                    |
| `apps/docs`           | `cre-docs`   | `https://docs.cre.run`   | `pr-<番号>-cre-docs.toy0.workers.dev`   |
| `apps/message-editor` | `cre-editor` | `https://editor.cre.run` | `pr-<番号>-cre-editor.toy0.workers.dev` |

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
