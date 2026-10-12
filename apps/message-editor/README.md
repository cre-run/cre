# @cre/message-editor

Message Editor のモック（SPA）です。返信の下書きを段落ごとに編集しながら、
各段落の確認状況（確認済み・条件あり・再確認・根拠なし）と、根拠（種類・立場・確認日時の鮮度）を表示します。

ドキュメント: `apps/docs/docs/message-editor/`（`index.mdx` がガイド、`data-handling.mdx` がデータの取り扱い。どちらも `preview`）

## データの渡し方

バックエンドはなく、画面に渡すデータ（`src/types.ts` の `ReplyReviewPayload`）を JSON にして
pako で圧縮し、base64url で URL の `#d=` に載せます。`#...&p=r3` で最初に選ぶ段落を指定できます。
データがないときは `src/sample.ts` の見本（架空のデータ）を表示します。

```bash
vp run @cre/message-editor#dev                                  # 開発サーバー
node scripts/encode.ts payload.json --base http://localhost:5173/   # JSON から URL を作る（このディレクトリで実行）
node scripts/encode.ts                                          # 見本データの URL
vp run @cre/message-editor#test
vp run @cre/message-editor#build
```

`encode` は `vp run` ではなく `node` で直接実行します。`vp run` は出力をキャッシュするため、入力ファイルを変えても
前回の URL が出ることがあり、生成した URL（判定データを含む）が `node_modules/.vite/task-cache/` に残ります。
また `vp run ... -- payload.json --base URL` の形では `--` 以降がすべてファイル名として扱われ、`--base` が効きません。

受け取ったデータは `src/payload.ts` の `isPayload` で検証し、形式が合わないもの（必須の項目がない、
根拠の `url` が `http(s)` 以外、圧縮データが `MAX_ENCODED_LENGTH`（10 万文字）を超える、
展開後が `MAX_DECODED_BYTES`（1 MB）を超える、など）は表示せず、
見本データとエラーを表示します。`javascript:` などの URL はリンクになりません。
展開は大きさを見ながら行い、上限を超えた時点で打ち切るので、小さな URL が巨大なデータに展開される「展開爆弾」でもタブは固まりません。

### セキュリティとプライバシー

ガイドの「判定データの扱いについて」と `apps/docs/docs/message-editor/data-handling.mdx` で約束している内容です。`tests/data-handling.test.ts` と
`e2e/guide-message-editor-data-handling.e2e.ts` で確かめ続けています。

- 判定データは URL の `#` 以降に載るため、サーバー（Cloudflare）には送られません。Worker にロジックはなく、静的ファイルを返すだけです
- 画面はデータをブラウザの中だけで復号・表示します。`fetch` などでの送信、解析タグ・外部スクリプトの読み込み、
  `localStorage` などへの保存は行いません。編集内容は React の state だけに持ち、画面を閉じると消えます
- 根拠のリンクは `rel="noreferrer"` 付きで新しいタブに開くため、遷移先に URL（判定データ）も `window.opener` も渡しません
- ただし URL は圧縮されているだけで暗号化はされていません。ブラウザの履歴やブックマーク、リンクを貼ったチャットやチケットには残ります。
  実際の問い合わせ内容を扱う URL は、権限管理された場所にだけ貼ってください
- URL は誰でも作れ、作成者を検証しません。画面が「確認済み」と表示しても、それは URL に書かれていた値です
- `<meta name="robots" content="noindex">` を付け、検索エンジンには載せません

## デプロイ

Cloudflare Workers の `cre-editor` として、静的ファイル（`dist/`）を `https://editor.cre.run` で配信します（`wrangler.jsonc`）。

- `main` へ `apps/message-editor` などの変更が push されると、`.github/workflows/deploy-message-editor.yml` がビルドと `wrangler deploy` を実行します。Actions タブから手動実行も可能です
- PR を開くと `.github/workflows/preview-message-editor.yml` が Worker Previews で `pr-<番号>` のプレビューを作り、URL を PR にコメントします。PR を閉じると `preview-cleanup.yml` が削除します
- シークレットは他のアプリと共通の `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を使います

## E2E とドキュメントの画像

E2E は Playwright です（`playwright.config.ts`、`e2e/`）。

- `e2e/critical-path.e2e.ts` — 壊れるとガイドの手順が成り立たなくなる操作（画像は撮らない）
- `e2e/guide-message-editor.e2e.ts` — ガイド（`apps/docs/docs/message-editor/index.mdx`）の手順をなぞり、
  ガイドの画像 `apps/docs/docs/message-editor/*.png` と比べる（VRT）
- `e2e/guide-message-editor-data-handling.e2e.ts` — ガイドの「判定データの扱いについて」のとおり、判定データが外部に送られず、ブラウザにも残らないことを確かめる（画像は撮らない）

```bash
vp exec playwright test                # ビルドしてプレビューサーバーを起動し、全 E2E を実行
vp exec playwright test critical-path  # クリティカルパスだけ
```

CI（`.github/workflows/e2e.yml`）は PR と `main` で全 E2E を実行し、画像に差分があれば失敗します。
画面の変更が意図どおりなら、PR に `update-screenshots` ラベルを付けると、CI が画像を撮り直して PR にコミットします
（`.github/workflows/update-screenshots.yml`）。Files changed の画像差分を確認してからマージしてください。

フォントの描画がローカルと CI で違うため、基準画像は CI で撮ったものだけをコミットします
（ローカルで `--update-snapshots` した画像はコミットしない）。
