# apps/short-url（設計）

Message Editor 専用の短縮 URL サービスの設計です。**まだ実装していません。** プロトタイプとして、一定のセキュリティを保ちながら、仕様をできるだけ小さくしています。

ガイド（すべて `planned`）: `apps/docs/docs/short-url/` の `index.mdx`（使い方）・`data-handling.mdx`（約束）・`self-hosting.mdx`（設定の手順）。
このドキュメントとガイドが食い違ったら、ガイドが正です。

## なぜ作るか

Message Editor は判定データを URL の `#d=` に載せます（JSON → pako → base64url）。見本データでも URL は 3,578 文字あり、
Slack Block Kit のボタン `url`・section `text`（どちらも 3,000 文字まで）を 578 文字超えます。Azure DevOps の PR 説明（4,000 文字）にも、実データでは収まりません。
短縮 URL なら、判定データの大きさによらず `https://<ドメイン>/id/<UUID>` の 60 文字前後に収まります。

## 決めたこと

| 項目       | 決定                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 提供の形   | セルフホスト・シングルテナント（組織ごとに自分の Cloudflare にデプロイ）。CRE 自身は `cre-short` / `s.cre.run`                                                            |
| 短縮 URL   | `https://<ドメイン>/id/<UUID v4>`                                                                                                                                         |
| 開ける人   | Cloudflare Access で組織のメールのドメインでログインした人だけ。Worker も Access の JWT のメールのドメインを `ACCESS.allowedEmailDomains` と照らす                        |
| 開いたとき | `GET /id/<UUID>` → 復号 → `302` で `<EDITOR_URL>#d=<data>` へ。Message Editor は変えない                                                                                  |
| 登録       | 同じ Cloudflare アカウントの Worker（Bot）から、Service Binding の RPC `create(data)` だけで受け付ける。インターネットに公開した登録の API とキーはない。削除の機能もない |
| 保存       | D1 に `#d=` の値をそのまま保存する（プロトタイプでは暗号化しない）。有効期限はない                                                                                        |

## データの扱い

- **Access 前提で fail closed にする。** Access は `wrangler.jsonc` では設定できないので、Worker の側で次を確かめ、どれかが欠ければ判定データを返しません
  - `vars.BASE_URL` がある（なければ `503`）
  - `vars.ACCESS` の `allowedEmailDomains`（空でない配列）・`teamDomain`・`aud` がそろっている（なければ `503`）
  - `/id/*` では、Access の JWT からメールのドメインを確かめる（下記）
- **Access の JWT でメールのドメインを確かめる（`/id/*` のたびに）。** Cloudflare の [JWT の検証の手順](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/) に従います
  1. リクエストヘッダー `Cf-Access-Jwt-Assertion` から JWT を読む。なければ `503`（Access がかかっていない）。ヘッダーは誰でも付けられるので、次の署名の検証を省かない。`Cf-Access-Authenticated-User-Email` ヘッダーは署名がないので使わない
  2. `<teamDomain>/cdn-cgi/access/certs` の公開鍵（`kid` で選ぶ）で RS256 の署名を確かめ、`iss` が `<teamDomain>` と一致し、`aud` に `ACCESS.aud` が含まれ、`exp` が切れていないことを確かめる。満たさなければ `403`
  3. `email` クレームの `@` より後ろ（小文字にする）が、`allowedEmailDomains` のどれかと完全に一致することを確かめる（サブドメインは含めない）。`email` がない（サービストークンなど）か、一致しなければ `403`
  - 公開鍵は取得して Worker のメモリに短く持つ（Access は約 6 週間ごとに鍵を入れ替え、古い鍵も 7 日は有効）。検証には `jose`（Cloudflare の例と同じ。足すときは `minimumReleaseAge` に注意）か Web Crypto を使う
  - Access のポリシーでドメインを絞っていても、Worker でもう一度確かめます。ポリシーを誤って広げたり、Access を外したりしても、判定データは返りません
- **保存。** `data`（`#d=` より後ろの値）をそのまま D1 に保存します。D1 を読める人と、バックアップ（Time Travel、消した後も最長 30 日）からは読めます。自組織のアカウントの中なので、プロトタイプではこれを許容します
- **302 で転送する。** `/id/*` は Access の後ろにあるので、展開ボットやクローラーは転送先（判定データ）まで届きません。応答には `Cache-Control: no-store`・`Referrer-Policy: no-referrer`・`X-Robots-Tag: noindex` を付けます。転送先は設定の `EDITOR_URL` だけです（オープンリダイレクトにしない）。`404`・`403`・`503` の HTML は固定の文言だけで、UUID やリクエストの内容を埋め込みません
- **守るのは入口だけ。** 転送先の Message Editor の URL（`#d=` に判定データ全体）は、ログインなしで開けます。開いた人のブラウザの履歴に残り、コピーして貼れば誰でも読めます。これは今の `#d=` の URL と同じで、短縮 URL が守るのは「URL を知っているだけの人が開く」ことです
- **ログ。** 判定データ・Secret・メールアドレスはコードからログに書きません。URL（UUID）は Workers Logs に残りますが、UUID だけでは開けません
- **検査。** 登録時に、`data` が `^[A-Za-z0-9_-]+$`（base64url）だけでできていることと、Message Editor と同じ `decodePayload` を通ることを確かめます（10 万文字・展開後 1 MB の上限も同じ）。前者は、`Location` ヘッダーや `#d=` に改行や `&` などを混ぜられないようにするためです。実装時に `apps/message-editor/src/payload.ts` を `packages/` に切り出して共有します

## API

| 入口                                     | 呼べる人                                        | 内容                                                                                             |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /id/{uuid}`（HTTP）                 | Access でログインした組織の人                   | `302` で Message Editor へ。見つからないは `404`、ドメイン違いは `403`、設定不足は `503` の HTML |
| `create(data)`（RPC。`ShortUrl` クラス） | Service Binding を張った同じアカウントの Worker | `data` を検査して保存し、`{ id, url }` を返す。検査に通らなければ例外を投げる                    |

- `create()` は `WorkerEntrypoint` を継いだ名前付きの入口 `ShortUrl` に置きます。RPC のメソッドは HTTP からは呼べず、Binding を張れるのは同じアカウントにデプロイできる人だけです。これを登録の認証とし、キーは持ちません
- HTTP の入口は `GET /id/{uuid}` だけで、ほかのパスは `404` です。Worker の HTTP はすべて Access の後ろにあります（`/api/*` の除外は要らない）
- `url` は `vars.BASE_URL` から作ります（RPC には呼び出し元のホスト名がないため）
- `wrangler.jsonc` は、ほかの Worker と同じく `workers_dev: false`・`preview_urls: false` にします。入口を `routes` のドメインだけにし、Access の対象を 1 つにします

## 設定

| 名前         | 種類           | 内容                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACCESS`     | `vars`（必須） | `{"allowedEmailDomains": ["example.com"], "teamDomain": "https://example.cloudflareaccess.com", "aud": "…"}`。開けるメールのドメイン（JWT の `email` の `@` より後ろと完全一致）、Access のチームの origin（スキームを含む。JWT の `iss` と公開鍵の取得先。ローカルでは `http://localhost:8788` のように HTTP でもよい）、`aud` と比べる AUD タグ。`.dev.vars` では JSON の文字列で書く |
| `EDITOR_URL` | `vars`         | 既定 `https://editor.cre.run/`。`https:` で始まり `#` を含まないこと                                                                                                                                                                                                                                                                                                                    |
| `BASE_URL`   | `vars`（必須） | 短縮 URL のドメイン（例: `https://short.example.com`）。`create()` が返す `url` に使う                                                                                                                                                                                                                                                                                                  |

コマンドは `vp exec` で実行します。`vp run` は環境変数を引き継がず出力をキャッシュするので使いません。

## D1 のスキーマ（案: `migrations/0001_init.sql`）

```sql
CREATE TABLE links (
  id         TEXT PRIMARY KEY,       -- UUID v4
  data       TEXT NOT NULL,          -- #d= より後ろの値
  created_at INTEGER NOT NULL        -- UNIX 秒
);
```

## 運用

- デプロイ: `main` への push で `deploy-short-url.yml` が `vp exec wrangler d1 migrations apply cre-short --remote` → `vp exec wrangler deploy` を実行します（CI の API トークンに D1 の編集権限を足す）
- PR ごとのプレビュー: プロトタイプのあいだは作りません（`preview_urls: false`。古い版の Version URL も出ない）。確認はローカルと E2E で行います。ローカルには Access がないので、テスト用の鍵で署名した JWT をヘッダーに付け、`ACCESS.teamDomain` をテスト用の公開鍵を返すローカルのサーバーに向けます（実装時にスクリプトを用意する）
- 消したいとき: 削除の API はありません。ID が分かれば `vp exec wrangler d1 execute cre-short --remote --command "DELETE FROM links WHERE id = '…'"`、すべてなら `DELETE FROM links`
- Message Editor のガイド（`message-editor/data-handling.mdx`）とテストは変わりません

## 後回しにしたこと

プロトタイプでは作りません。必要になったら足します。

- レート制限（Access と Service Binding で、使える人が限られているため）
- 監査ログ
- 同じアカウントの外（別のアカウントや外部のサービス）からの登録（そのときは HTTP の API とキーを足す）
- 削除の API
- PR ごとのプレビュー（プレビュー用の D1・Access が要る）
- 有効期限（消すまで開ける。必要になったら `expires_at` を足し、読み出し時に判定する）
- 保存時の暗号化（D1 とバックアップから読めないようにする。Worker の Secret の鍵で AES-256-GCM にする案）

## 採用しなかった案

| 案                                                      | 理由                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 鍵を URL の `#k=` に置く（サーバーも読めない形）        | URL は「ドメイン + UUID」を基本にすると決めた。プロトタイプでは Access で足りる                                                 |
| Access を使わず、URL だけで開けるようにする             | URL がログや転送で漏れると、組織の外の人でも読める                                                                              |
| 静的なページと JavaScript で読み出す                    | 展開ボットに判定データを渡さないための仕組みだったが、Access の後ろに置けば 302 で足りる                                        |
| Message Editor に `fetch` を足す                        | エディターの「画面から送信しない」約束とテストを変えることになる                                                                |
| HTTP の登録 API と共有のキー（`Authorization: Bearer`） | 登録するのは同じアカウントの Worker だけなので、Service Binding で足りる。キーの管理と、Access の `/api/*` の除外が要らなくなる |

## 未決事項

- CRE 自身のインスタンスの `ACCESS.allowedEmailDomains`
- `database_id` をリポジトリの `wrangler.jsonc` に書くか
- Workers Free で動かすか（CPU 10 ms で、1 MB までの展開と検査が収まるか）
- Worker 単位の Access（「Protect this Worker behind Access」）でも、`Cf-Access-Jwt-Assertion` ヘッダーがリクエストに付くことを、実際に設定して確かめる（付かなければ、ホスト名を対象にした Access のアプリケーションに切り替える）

## 実装の順番

1. このガイドと設計を人と合意する（この PR）
2. `payload.ts` を `packages/` に切り出す
3. 約束のテストとガイドの E2E を赤から書く
4. Worker・D1・CLI を実装して緑にする（`.gitignore` に `.dev.vars` を足す）
5. デプロイの CI を足し、本番の D1・Access を用意し、Bot の Worker に Service Binding を張る
