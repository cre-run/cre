# apps/short-url（設計）

Message Editor 専用の短縮 URL サービスの設計です。**まだ実装していません。** プロトタイプとして、一定のセキュリティを保ちながら、仕様をできるだけ小さくしています。

ガイド（すべて `planned`）: `apps/docs/docs/short-url/` の `index.mdx`（使い方）・`data-handling.mdx`（約束）・`self-hosting.mdx`（設定の手順）。
このドキュメントとガイドが食い違ったら、ガイドが正です。

## なぜ作るか

Message Editor は判定データを URL の `#d=` に載せます（JSON → pako → base64url）。見本データでも URL は 3,578 文字あり、
Slack Block Kit のボタン `url`・section `text`（どちらも 3,000 文字まで）を 578 文字超えます。Azure DevOps の PR 説明（4,000 文字）にも、実データでは収まりません。
短縮 URL なら、判定データの大きさによらず `https://<ドメイン>/id/<UUID>` の 60 文字前後に収まります。

## 決めたこと

| 項目       | 決定                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 提供の形   | セルフホスト・シングルテナント（組織ごとに自分の Cloudflare にデプロイ）。CRE 自身は `cre-short` / `s.cre.run`                                     |
| 短縮 URL   | `https://<ドメイン>/id/<UUID v4>`                                                                                                                  |
| 開ける人   | Cloudflare Access で組織のメールのドメインでログインした人だけ。Worker も Access の JWT のメールのドメインを `ACCESS.allowedEmailDomains` と照らす |
| 開いたとき | `GET /id/<UUID>` → 復号 → `302` で `<EDITOR_URL>#d=<data>` へ。Message Editor は変えない                                                           |
| 登録       | `POST /api/links`。Worker の Secret `BOT_KEY` を Bearer で付ける（Bot 共通の 1 つのキー）。`/api/*` は Access の対象外。削除の API はない          |
| 保存       | D1 に AES-256-GCM の暗号文だけを保存。鍵は Worker の Secret `LINK_MASTER_KEY`。有効期限はなく、鍵を変えるとすべて開けなくなる                      |

## データの扱い

- **Access 前提で fail closed にする。** Access は `wrangler.jsonc` では設定できないので、Worker の側で次を確かめ、どれかが欠ければ判定データを返しません
  - `LINK_MASTER_KEY` が 32 バイトとして読め、`BOT_KEY` がある（なければ `503`）
  - `vars.ACCESS` の `allowedEmailDomains`・`teamDomain`・`aud` がそろっている（なければ `503`）
  - `/id/*` では、Access の JWT からメールのドメインを確かめる（下記）
- **Access の JWT でメールのドメインを確かめる（`/id/*` のたびに）。** Cloudflare の [JWT の検証の手順](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/) に従います
  1. リクエストヘッダー `Cf-Access-Jwt-Assertion` から JWT を読む。なければ `503`（Access がかかっていない）
  2. `https://<teamDomain>/cdn-cgi/access/certs` の公開鍵（`kid` で選ぶ）で RS256 の署名を確かめ、`iss` が `https://<teamDomain>`、`aud` に `ACCESS.aud` が含まれ、`exp` が切れていないことを確かめる。満たさなければ `403`
  3. `email` クレームの `@` より後ろ（小文字にする）が、`allowedEmailDomains` のどれかと完全に一致することを確かめる（サブドメインは含めない）。一致しなければ `403`
  - 公開鍵は取得して Worker のメモリに短く持つ（Access は約 6 週間ごとに鍵を入れ替え、古い鍵も 7 日は有効）。検証には `jose`（Cloudflare の例と同じ。足すときは `minimumReleaseAge` に注意）か Web Crypto を使う
  - Access のポリシーでドメインを絞っていても、Worker でもう一度確かめます。ポリシーを誤って広げたり、Access を外したりしても、判定データは返りません
- **暗号化。** `ciphertext = IV(12 バイト) || AES-256-GCM(LINK_MASTER_KEY, data, AAD = UUID)`。`data` は `#d=` より後ろの値そのもの。D1 とバックアップ（Time Travel、最長 30 日）には暗号文しか残らず、鍵がなければ読めません。鍵を変えると、それまでのリンクはすべて開けなくなります
- **302 で転送する。** `/id/*` は Access の後ろにあるので、展開ボットやクローラーは転送先（判定データ）まで届きません。応答には `Cache-Control: no-store`・`Referrer-Policy: no-referrer`・`X-Robots-Tag: noindex` を付けます。転送先は設定の `EDITOR_URL` だけです（オープンリダイレクトにしない）
- **ログ。** 判定データ・Secret・メールアドレスはコードからログに書きません。URL（UUID）は Workers Logs に残りますが、UUID だけでは開けません
- **検査。** 登録時に Message Editor と同じ `decodePayload` を通します（10 万文字・展開後 1 MB の上限も同じ）。実装時に `apps/message-editor/src/payload.ts` を `packages/` に切り出して共有します

## API

| メソッドとパス    | 認証   | 内容                                                                                                           |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `GET /id/{uuid}`  | Access | `302` で Message Editor へ。見つからない・復号できないは `404`、ドメイン違いは `403`、設定不足は `503` の HTML |
| `POST /api/links` | Bearer | 本文 `{"data": "…"}` → `201 {"id", "url"}`                                                                     |

`/api/*` のエラーは `{"error": "<コード>"}` だけを返します（`invalid_request`・`invalid_payload`・`unauthorized`・`too_large`・`not_configured`）。
`BOT_KEY` の照合は、両方を SHA-256 にしてから `crypto.subtle.timingSafeEqual` で比べます（長さに左右されない定数時間の比較）。

## Secret と設定

| 名前              | 種類             | 内容                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LINK_MASTER_KEY` | Worker の Secret | 32 バイトの乱数の base64url。`wrangler secret put` で登録                                                                                                                                                                                                              |
| `ACCESS`          | `vars`（必須）   | `{"allowedEmailDomains": ["example.com"], "teamDomain": "example.cloudflareaccess.com", "aud": "…"}`。開けるメールのドメイン（JWT の `email` の `@` より後ろと完全一致）、JWT の `iss` と公開鍵の取得先、`aud` と比べる AUD タグ。`.dev.vars` では JSON の文字列で書く |
| `EDITOR_URL`      | `vars`           | 既定 `https://editor.cre.run/`。`https:` で始まり `#` を含まないこと                                                                                                                                                                                                   |
| `BOT_KEY`         | Worker の Secret | 32 バイトの乱数の base64url。Bot が `Authorization: Bearer` で付ける。漏れたら作り直して Bot の側も置き換える                                                                                                                                                          |

コマンドは `vp exec` で実行します。`vp run` は環境変数を引き継がず出力をキャッシュするので使いません。

## D1 のスキーマ（案: `migrations/0001_init.sql`）

```sql
CREATE TABLE links (
  id         TEXT PRIMARY KEY,       -- UUID v4
  ciphertext BLOB NOT NULL,          -- IV(12) || AES-256-GCM(data)
  created_at INTEGER NOT NULL        -- UNIX 秒
);
```

## 運用

- デプロイ: `main` への push で `deploy-short-url.yml` が `vp exec wrangler d1 migrations apply cre-short --remote` → `vp exec wrangler deploy` を実行します（CI の API トークンに D1 の編集権限を足す）
- PR ごとのプレビュー: プロトタイプのあいだは作りません（`preview_urls: false`。古い版の Version URL も出ない）。確認はローカルと E2E で行います。ローカルには Access がないので、テスト用の鍵で署名した JWT をヘッダーに付け、`ACCESS.teamDomain` をテスト用の公開鍵を返すローカルのサーバーに向けます（実装時にスクリプトを用意する）
- 消したいとき: 削除の API はありません。ID が分かれば `vp exec wrangler d1 execute cre-short --remote --command "DELETE FROM links WHERE id = '…'"`、すべてなら `LINK_MASTER_KEY` を変えます
- Message Editor のガイド（`message-editor/data-handling.mdx`）とテストは変わりません

## 後回しにしたこと

プロトタイプでは作りません。必要になったら足します。

- レート制限（Access と `BOT_KEY` で、使える人が限られているため）
- Bot ごとのキー（発行・無効化の仕組みと `clients` テーブル）と監査ログ
- 削除の API
- PR ごとのプレビュー（プレビュー用の D1・鍵・Access が要る）
- 有効期限（鍵を変えるまで開ける。必要になったら `expires_at` を足し、読み出し時に判定する）
- それまでのリンクを生かしたままの鍵の入れ替え

## 採用しなかった案

| 案                                               | 理由                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 平文で D1 に保存する                             | D1 のバックアップ（Time Travel）は無効にできず、削除後も 30 日残る                       |
| 鍵を URL の `#k=` に置く（サーバーも読めない形） | URL は「ドメイン + UUID」を基本にすると決めた。Access と保存時の暗号化で足りる           |
| Access を使わず、URL だけで開けるようにする      | URL がログや転送で漏れると、組織の外の人でも読める                                       |
| 静的なページと JavaScript で読み出す             | 展開ボットに判定データを渡さないための仕組みだったが、Access の後ろに置けば 302 で足りる |
| Message Editor に `fetch` を足す                 | エディターの「画面から送信しない」約束とテストを変えることになる                         |

## 未決事項

- CRE 自身のインスタンスの `ACCESS.allowedEmailDomains`
- `/api/*` の Bypass が Worker の Access より優先されることを、実際に設定して確かめる
- `database_id` をリポジトリの `wrangler.jsonc` に書くか
- Workers Free で動かすか（CPU 10 ms で、1 MB までの展開と検査が収まるか）

## 実装の順番

1. このガイドと設計を人と合意する（この PR）
2. `payload.ts` を `packages/` に切り出す
3. 約束のテストとガイドの E2E を赤から書く
4. Worker・D1・CLI を実装して緑にする（`.gitignore` に `.dev.vars` を足す）
5. デプロイの CI を足し、本番の D1・鍵・Access を用意する
