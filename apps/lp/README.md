# @cre/lp

「Coming soon」を表示するだけの準備中ページです。
Cloudflare Workers の静的アセット配信のみで動作し、Worker スクリプトはありません。

- `public/` — 配信する HTML / favicon
- `wrangler.jsonc` — Worker 名 `cre-lp` の設定

## 開発

```bash
vp run @cre/lp#dev     # wrangler dev でローカル起動
vp run @cre/lp#build   # wrangler deploy --dry-run で設定と資産を検証
```

## デプロイ

`main` へ `apps/lp` などの変更が push されると、`.github/workflows/deploy-lp.yml` が `wrangler deploy` を実行します。
Actions タブから手動実行（workflow_dispatch）も可能です。

リポジトリの Actions シークレットに以下を設定してください。

| シークレット            | 内容                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | 「Edit Cloudflare Workers」テンプレートで作成した API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | デプロイ先の Cloudflare アカウント ID                          |
