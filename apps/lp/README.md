# @cre/lp

`cre.run` で配信しているページです。ロゴの下に、次の 3 枚のカードを並べています（幅に合わせて 3 列 → 2 列 → 1 列）。

| カード         | 色（`--accent`） | リンク先                                                 |
| -------------- | ---------------- | -------------------------------------------------------- |
| Message Editor | ミント           | プロトタイプ（[editor.cre.run](https://editor.cre.run)） |
| GitHub で Star | 星の黄色         | [cre-run/cre](https://github.com/cre-run/cre)            |
| X でフォロー   | 白               | [@ToyB0x\_](https://x.com/ToyB0x_)                       |

Cloudflare Workers の静的アセット配信のみで動作し、Worker スクリプトはありません。外部のスクリプト・フォント・画像は読み込みません。

- `public/` — 配信する HTML（CSS とアイコンの SVG は HTML に埋め込み）/ favicon
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
