# apps/short-url（設計）

Message Editor 専用の短縮 URL サービスの設計ドキュメントです。**まだ実装していません**（コードはありません）。
Cloudflare Workers と D1 で動かし、長い `#d=` の判定データを `https://<自組織のドメイン>/<UUID>` の短い URL にします。

ガイド（使う人向け。すべて `planned`）:

- `apps/docs/docs/short-url/index.mdx` — 何ができるか、URL の形、開いたときの動き、有効期限、API の使い方
- `apps/docs/docs/short-url/data-handling.mdx` — 約束の表（何がサーバーに届き、何が残り、何が残らないか）
- `apps/docs/docs/short-url/self-hosting.mdx` — セルフホストで設定する Secret・環境変数・`wrangler.jsonc` の項目と、その設定のしかた

このドキュメントとガイドが食い違ったら、ガイドが正です（ガイドを先に直して人と合意してから、ここを直す）。

## なぜ作るか

Message Editor は、判定データを JSON → pako（deflate）→ base64url にして URL の `#d=` に載せます。この URL は長く、共有先の上限に当たります。

| 項目                              | 値                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| 見本データの URL 全長             | 3,578 文字（`https://editor.cre.run/` 23 文字 + `#d=` 以降 3,555 文字）               |
| 見本データの JSON                 | 7,003 バイト。JSON 1.97 バイトにつき URL が 1 文字伸びる                              |
| Slack の通常メッセージ本文        | 40,000 文字で切り詰め（推奨 4,000）。見本は推奨値まで 422 文字しか余裕がない          |
| Slack Block Kit の section `text` | 3,000 文字まで。**見本でも 578 文字超える**                                           |
| Slack Block Kit のボタン `url`    | 3,000 文字まで。**見本でも 578 文字超える**（ボタンにできるのは JSON 約 5.9 KB まで） |
| Azure DevOps の PR 説明           | 4,000 文字（UTF-16 単位）を超えると保存に失敗する                                     |
| Message Editor が受け付ける上限   | 圧縮後 100,000 文字（`MAX_ENCODED_LENGTH`）、展開後 1 MB（`MAX_DECODED_BYTES`）       |

出典: Slack `chat.postMessage` / Button element / Section block のリファレンス（docs.slack.dev）、Azure DevOps Pull Requests REST API。

Bot が Slack の Block Kit で「エディターで開く」ボタンを出そうとしても、見本データの段階ですでに上限を超えます。実データ（段落や根拠が増える）では、メッセージ本文の推奨値も超えます。

## 決めたこと（要約）

| 項目             | 決定                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 提供の形         | **セルフホスト・シングルテナント**。組織ごとに自分の Cloudflare アカウントへデプロイする。CRE 自身も `s.cre.run` で同じものを使う |
| 共有 URL         | `https://<自組織のドメイン>/<UUID v4>`。フラグメントに鍵は置かない                                                                |
| 保存するデータ   | `#d=` の値を **サーバーの鍵 × UUID から作った鍵** で AES-256-GCM 暗号化した暗号文。UUID そのものは保存しない                      |
| サーバーの鍵     | Worker の Secret `LINK_MASTER_KEY`（32 バイト）。**設定されていないあいだは、登録も読み出しもできない**（503）                    |
| 登録 API の認証  | クライアントごとの Secret を `Authorization: Bearer` で送る。D1 には SHA-256 のハッシュだけを置き、定数時間で比較する             |
| Secret の発行    | 管理者が CLI（`vp exec node scripts/clients.ts`）で発行する。管理用の HTTP API は作らない                                         |
| 有効期限         | 既定 30 日。登録時に 1 時間〜90 日を指定できる                                                                                    |
| 削除             | 削除 API（Secret が必要）で行ごと消す。期限切れは読み出し時に弾き、Cron が 1 日 1 回消す                                          |
| 開いたときの動き | どの ID でも同じ静的なページ → JS が `GET /api/links/<UUID>` → `location.replace(<EDITOR_URL>#d=…)`。302 リダイレクトにはしない   |
| Message Editor   | **変更しない**（今のまま `#d=` を受け取る。`fetch` を足さない）                                                                   |
| Worker・ドメイン | `cre-short`、`s.cre.run`（CRE のインスタンス）。PR ごとのプレビューは、プレビュー専用の D1 と鍵を使う                             |

## 1. データの取り扱い

### 前提: セルフホスト・シングルテナント

短縮 URL のサーバーは、使う組織が自分の Cloudflare アカウントにデプロイします。1 つのデプロイに入るのは 1 つの組織のデータだけで、テナントの分離は考えません。
CRE の運営者のサーバーには判定データが届きません（Message Editor に `editor.cre.run` を使う場合も、`#d=` はサーバーに送られません）。

そのうえで、次の場所から判定データを読めないようにします。

- D1 の中身（Cloudflare のダッシュボード、`wrangler d1 export`、D1 を読める権限を持つ人）
- D1 のバックアップ（Time Travel。常に有効で無効にできず、Workers Paid では 30 日、Free では 7 日残る）

### 暗号化と鍵の導出

`LINK_MASTER_KEY`（以下 MASTER）は、32 バイトの乱数を base64url にしたものです。Web Crypto だけで実装します（依存を足さない）。

```text
lookupKey  = HKDF-SHA256(ikm = MASTER, salt = "", info = "cre-short-url/v1/lookup")          → HMAC-SHA256 の鍵
id_hash    = hex(HMAC-SHA256(lookupKey, UUID))                                               → D1 の主キー
encKey     = HKDF-SHA256(ikm = MASTER, salt = "", info = "cre-short-url/v1/encrypt/" + UUID) → AES-256-GCM の鍵
ciphertext = IV(12 バイトの乱数) || AES-256-GCM(encKey, IV, 平文 = UTF-8(data), AAD = "cre-short-url/v1")
```

- `data` は Message Editor の `#d=` より後ろの値（base64url の文字列）そのものです。エディターの上限（10 万文字）と保存する値が 1 対 1 に対応します
- D1 にあるのは `id_hash` と `ciphertext` だけで、UUID はありません
  - D1 だけでは読めません（MASTER がない）
  - D1 と MASTER の両方があっても読めません（UUID がなく、`id_hash` からは戻せない。UUID は 122 ビットの乱数）
  - 読めるのは、短縮 URL（UUID）を知っている人が、動いているサーバーに問い合わせたときだけです
- MASTER を変えると、`id_hash` も `encKey` も変わるので、それまでのリンクはすべて開けなくなります。これを「全部消す」手段としても使います（crypto-shredding）
- 平文は登録時と読み出し時に Worker のメモリを通ります。Worker のコードを書き換えられる人（Cloudflare アカウントの権限を持つ人）からは守れません（脅威モデルを参照）

### 鍵が設定されていないとき

MASTER が設定されていない、または base64url として 32 バイトに戻せないときは、`/api/*` はすべて `503 not_configured` を返します（認証より先に判定する）。
開くページは「短縮 URL の設定が終わっていません」と表示します。鍵を使わずに保存する道は作りません（暗号化できないと保存できない構造にする）。

### 保存期間・失効・削除

- 有効期限は登録時に `expiresIn`（秒）で指定します。範囲は 3,600〜7,776,000（1 時間〜90 日）、既定は 2,592,000（30 日）です
- 読み出すときに `expires_at > now` を条件にするので、Cron が遅れても期限を過ぎたリンクは開けません
- Cron Trigger（1 日 1 回）が、期限切れのリンクと、1 年を過ぎた監査ログを消します
- 削除 API は行ごと消します（`deleted_at` による論理削除はしない。消したものを残しておく理由がないため）。消した記録は監査ログに残します

### リンク展開（unfurl）・クローラー

- `GET /<UUID>` は、どの ID でも同じ静的な HTML を返します。ID の有無も判定データも、HTML には入りません
- 判定データを取りに行くのはページの JavaScript（`GET /api/links/<UUID>`）だけです。JavaScript を実行しない展開ボット（Slack など）には届きません
- **302 リダイレクトにはしません。** `Location` ヘッダーに `#d=` が入り、展開ボットやリンクを検査するサービスに判定データ全体が渡るためです
- すべての応答に `X-Robots-Tag: noindex, nofollow` を付けます。HTML には `<meta name="robots" content="noindex, nofollow">` も付け、`/robots.txt` は `Disallow: /` にします
- Bot には、短縮 URL を投稿するときに展開を切る（Slack なら `unfurl_links: false`）ことを勧めます。ただし切らなくても判定データは出ません

### ログに残さないもの

- `wrangler.jsonc` で `observability.logs.invocation_logs: false` にします。呼び出しのログには URL（パスに入る UUID）が入るためです
- コードの `console.*` に出すのは、決まったエラーコード（`decrypt_failed` など）だけです。リクエスト本文、`Authorization`、UUID、`id_hash`、`data`、Secret はどのログにも書きません（テストで確かめる）
- 監査ログ（D1 の `audit_log`）に残すのは、時刻・クライアント・操作（作成・削除）・`data` の文字数・期限・`id_hash` だけです
- ゾーンのアクセスログ（Logpush など）や社内のプロキシは、この Worker の外にあります。そこではパス（UUID）が記録されうることを、ガイドに書いています

### 応答ヘッダー

| 対象     | ヘッダー                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| すべて   | `X-Robots-Tag: noindex, nofollow`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`                                                                                |
| HTML     | `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` |
| `/api/*` | `Cache-Control: no-store`、`Content-Type: application/json; charset=utf-8`。CORS のヘッダーは付けない（ブラウザから呼ぶのは同じオリジンのページだけ）                               |

## 2. 認証と Secret

### クライアントの Secret

- 形式: `crs_<client_id>_<secret>`（例: `crs_Q4mT9xZa_…`）
  - `client_id`: base62 で 8 文字。秘密ではなく、D1 で行を引くための ID
  - `secret`: base62 で 43 文字（約 256 ビットの乱数）
  - 先頭の `crs_` は、Secret scanning などで見つけやすくするための目印
- D1 の `clients.secret_hash` に置くのは `hex(SHA-256(Secret 全体))` だけです。Secret が 256 ビットの乱数なので、ハッシュから総当たりで戻すことはできません（bcrypt などの遅いハッシュは要らない）
- 照合: `client_id` で有効な（`disabled_at IS NULL`）行を引き、`crypto.subtle.timingSafeEqual` で定数時間で比べます。行がないときも、ダミーのハッシュと比べて時間をそろえます
- 失敗したときは、理由（ヘッダーがない・形式が違う・クライアントがない・無効・Secret が違う）によらず `401 {"error":"unauthorized"}` と `WWW-Authenticate: Bearer` だけを返します

HMAC 署名は採用しません。署名を検証するにはサーバーが Secret そのものを持つ必要があり、「D1 にはハッシュだけを置く」と両立しないためです（「採用しなかった案」を参照）。

### 発行・一覧・無効化（CLI）

`apps/short-url` で `vp exec` から実行します。`vp run` は使いません。`vp run` は環境変数をほとんど引き継がず（`CLOUDFLARE_API_TOKEN` が wrangler に届かない）、出力をキャッシュするので、発行した Secret が `node_modules/.vite/task-cache/` に残ります。

```bash
cd apps/short-url
vp exec node scripts/clients.ts create slack-bot          # 本番の D1 に登録し、Secret を一度だけ表示する
vp exec node scripts/clients.ts create dev --local        # ローカル開発の D1
vp exec node scripts/clients.ts list                      # id・name・created_at・disabled_at
vp exec node scripts/clients.ts disable Q4mT9xZa          # 無効にする（行は消さない）
```

- スクリプトは Secret を `crypto.getRandomValues` で作り、ハッシュだけを含む SQL を `wrangler d1 execute cre-short --remote --command …` で流します（シェルを経由せず、引数の配列で起動する）
- Secret は標準出力に一度だけ表示し、ファイルには書きません。自分で入力するものではないので、シェルの履歴にも残りません
- Secret の入れ替えは「新しいクライアントを作る → Bot を切り替える → 古いクライアントを無効にする」で行います

### Worker の Secret

| 名前              | 用途                            | 登録                                                                                |
| ----------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `LINK_MASTER_KEY` | 暗号化と `id_hash` の鍵（本番） | `vp exec wrangler secret put LINK_MASTER_KEY`                                       |
| `LINK_MASTER_KEY` | 同上（PR ごとのプレビュー）     | `vp exec wrangler preview base-config secret put LINK_MASTER_KEY`（本番とは別の値） |

```bash
# 画面にも履歴にも出さずに作って登録する
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" \
  | vp exec wrangler secret put LINK_MASTER_KEY
```

- リポジトリにも CI にも置きません。管理用のトークンは作りません（Secret の発行は CLI と `wrangler d1 execute` で足りるため）
- なくしたら、それまでのリンクは開けなくなります。最長 90 日で消えるデータで、元のデータは Bot 側にあるので、鍵を作り直して登録し直せば済みます
- 期限内のリンクを生かしたまま鍵を入れ替える仕組みは、初版では作りません（未決事項を参照）

### Worker の環境変数（`vars`）

| 名前         | 書かないとき              | 検査                                                                                                       |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `EDITOR_URL` | `https://editor.cre.run/` | `https:`（ローカルでは `http://localhost`）で始まり、`#` を含まないこと。満たさないと `503 not_configured` |

セルフホストで設定するもの（Secret・環境変数・`wrangler.jsonc`・CI の資格情報・クライアントの Secret）の一覧と手順は、ガイドの `self-hosting.mdx` にまとめています。

### レート制限

Workers の Rate Limiting binding（`ratelimits`）を使います。カウントは Cloudflare の拠点ごとの近似値なので、厳密な上限ではなく、総当たりと使いすぎを抑えるためのものです。

| binding               | キー               | 上限（初期値） | 対象                                                    |
| --------------------- | ------------------ | -------------- | ------------------------------------------------------- |
| `API_RATE_LIMITER`    | `CF-Connecting-IP` | 120 回 / 60 秒 | `/api/*` のすべて（認証の前。読み出しと認証失敗を含む） |
| `CLIENT_RATE_LIMITER` | `client_id`        | 60 回 / 60 秒  | 認証が通った登録・削除                                  |

IP をキーにすると、社内の NAT の後ろの人たちがまとめて数えられます。読み出しには認証がなく、ほかにキーにできるものがないので、上限を高めにしています。
UUID は 122 ビットの乱数なので、レート制限がなくても総当たりは現実的ではありません。

### リクエストの大きさ

| 項目                    | 上限                                                                | 超えたとき      |
| ----------------------- | ------------------------------------------------------------------- | --------------- |
| リクエスト本文          | 128 KiB（`Content-Length` と、読みながらの両方で確かめる）          | `413 too_large` |
| `data` の長さ           | 100,000 文字（Message Editor の `MAX_ENCODED_LENGTH`）              | `413 too_large` |
| `data` を展開した大きさ | 1 MB（Message Editor の `MAX_DECODED_BYTES`）。展開しながら打ち切る | `413 too_large` |

### 監査ログ

登録と削除のたびに `audit_log` に 1 行足します。判定データ・UUID・Secret は書きません。
「どのクライアントが、いつ、何件作ったか（消したか）」を SQL で集計できます。1 年を過ぎた行は Cron が消します。

## 3. API 仕様（案）

ベース URL は、短縮 URL のサーバーのオリジン（例: `https://s.cre.run`）です。`/api/*` の応答は JSON です。

### `POST /api/links` — 登録（認証あり）

```http
POST /api/links
Authorization: Bearer crs_Q4mT9xZa_...
Content-Type: application/json

{"data": "<Message Editor の #d= より後ろの値>", "expiresIn": 604800}
```

| 項目        | 型     | 必須 | 説明                                                                               |
| ----------- | ------ | ---- | ---------------------------------------------------------------------------------- |
| `data`      | string | ○    | `#d=` の値。Message Editor と同じ検査（`decodePayload`）を通ったものだけを登録する |
| `expiresIn` | number | —    | 有効期限（秒、整数）。3,600〜7,776,000。省略すると 2,592,000（30 日）              |

```http
HTTP/1.1 201 Created
Location: https://s.cre.run/0f8c3a52-6b1e-4d7a-9c25-3e4f5a6b7c8d

{"id": "0f8c3a52-6b1e-4d7a-9c25-3e4f5a6b7c8d", "url": "https://s.cre.run/0f8c3a52-6b1e-4d7a-9c25-3e4f5a6b7c8d", "expiresAt": "2026-10-19T09:00:00.000Z"}
```

処理の順: IP のレート制限 → 鍵の確認（`503`）→ 認証（`401`）→ クライアントのレート制限 → 本文の検査 → UUID の生成（`crypto.randomUUID()`）→ 暗号化して保存 → 監査ログ。
`url` のオリジンはリクエストの URL から作ります（プレビューではプレビューの URL になる）。

### `GET /api/links/{id}` — 読み出し（認証なし）

開くページの JavaScript だけが呼びます。

```http
HTTP/1.1 200 OK
Cache-Control: no-store

{"editorUrl": "https://editor.cre.run/#d=eJy1WW1P21gW...", "expiresAt": "2026-10-19T09:00:00.000Z"}
```

- `editorUrl` は、設定 `EDITOR_URL`（既定 `https://editor.cre.run/`）に `#d=<data>` を付けたものです。遷移先は設定で決まり、リクエストからは変えられません（オープンリダイレクトにしない）
- ID の形が UUID v4 でない、見つからない、期限切れ、復号できない（鍵を変えた後など）は、すべて `404 {"error":"not_found"}` にします。どれに当たるかは返しません

### `DELETE /api/links/{id}` — 削除（認証あり）

- 有効なクライアントの Secret があれば、作ったクライアントでなくても削除できます。シングルテナントで、削除の依頼に運用者用のクライアントで応えられるようにするためです。誰が消したかは監査ログに残ります
- 消したら `204`、見つからない・期限切れは `404 {"error":"not_found"}` を返します

### `GET /{id}` — 開くページ（認証なし）

- どの ID でも同じ静的な HTML と JavaScript を返します（ID の形が UUID v4 でないときは 404 のページ）
- JavaScript は `GET /api/links/{id}` を呼び、`200` なら `location.replace(editorUrl)` で移ります（「戻る」で開くページに戻らない）
- `404` は「このリンクは開けません」、`503` は「短縮 URL の設定が終わっていません」、`429` は「しばらくしてから開き直してください」を表示します。JavaScript が無効なら `<noscript>` で「JavaScript を有効にしてください」を表示します
- 表示の文言はガイド（`apps/docs/docs/short-url/index.mdx`）に合わせ、E2E で確かめます

### エラー

本文は `{"error": "<コード>"}` だけです（判定データやリクエストの中身を返さない）。

| HTTP | `error`                  | 場面                                                           |
| ---- | ------------------------ | -------------------------------------------------------------- |
| 400  | `invalid_request`        | JSON として読めない、項目が足りない、`expiresIn` が範囲外      |
| 400  | `invalid_payload`        | `data` を Message Editor が表示できない                        |
| 401  | `unauthorized`           | 認証の失敗（理由は返さない）                                   |
| 404  | `not_found`              | リンクがない、期限切れ、ID の形が違う                          |
| 405  | `method_not_allowed`     | 対応していないメソッド                                         |
| 413  | `too_large`              | 「リクエストの大きさ」の上限を超えた                           |
| 415  | `unsupported_media_type` | `Content-Type` が `application/json` でない                    |
| 429  | `rate_limited`           | レート制限（`Retry-After: 60` を付ける）                       |
| 503  | `not_configured`         | `LINK_MASTER_KEY` または `EDITOR_URL` が正しく設定されていない |

## 4. D1 のスキーマとマイグレーション

### スキーマ（案: `migrations/0001_init.sql`）

時刻は UNIX 秒（SQLite の `unixepoch()` と比べやすくするため）です。

```sql
-- API クライアント。Secret はハッシュだけを持つ
CREATE TABLE clients (
  id          TEXT PRIMARY KEY,          -- base62 8 文字（Secret の中にも入る）
  name        TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,             -- hex(SHA-256(Secret 全体))
  created_at  INTEGER NOT NULL,
  disabled_at INTEGER                    -- 無効にした時刻。行は消さない
);

-- 短縮 URL。UUID そのものと平文は持たない
CREATE TABLE links (
  id_hash    TEXT PRIMARY KEY,           -- hex(HMAC-SHA256(lookupKey, UUID))
  client_id  TEXT NOT NULL REFERENCES clients (id),
  ciphertext BLOB NOT NULL,              -- IV(12) || AES-256-GCM(data)
  size       INTEGER NOT NULL,           -- data の文字数
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX links_expires_at ON links (expires_at);
CREATE INDEX links_client_id_created_at ON links (client_id, created_at);

-- 監査ログ。判定データ・UUID・Secret は持たない
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY,
  at           INTEGER NOT NULL,
  client_id    TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('link.create', 'link.delete')),
  link_id_hash TEXT,                     -- Time Travel で戻した後に、削除をやり直すため
  size         INTEGER,
  expires_at   INTEGER
);
CREATE INDEX audit_log_at ON audit_log (at);
```

指示の案にあった `links.deleted_at` は持ちません（削除は行ごと消す）。`links.id` の代わりに `id_hash` を主キーにします。

### マイグレーションの置き場と適用

- 置き場: `apps/short-url/migrations/NNNN_<内容>.sql`。`wrangler.jsonc` の `d1_databases[].migrations_dir` で指定します
- 本番: デプロイのワークフローで `vp exec wrangler d1 migrations apply cre-short --remote` を流してから `wrangler deploy` します
- マイグレーションは、1 つ前のコードでも動く形（列の追加など、後方互換）にします。適用からデプロイまでの間と、プレビューでは古いコードが新しいスキーマを読むためです
- ローカル: `vp exec wrangler d1 migrations apply cre-short --local`。データは `.wrangler/state/`（`.gitignore` 済み）に入ります

### ローカル開発

```bash
cd apps/short-url
vp exec wrangler d1 migrations apply cre-short --local
vp exec node scripts/clients.ts create dev --local    # ローカル用の Secret
vp exec wrangler dev                                  # ローカルの D1（Miniflare）で起動
```

- 鍵は `.dev.vars` に `LINK_MASTER_KEY=<ローカル用の値>` と書きます。**`.dev.vars` は今の `.gitignore` に入っていないので、実装のときに足します**
- `EDITOR_URL` は `.dev.vars` で `http://localhost:4173/`（Message Editor の `vp preview`）などに向けます

### 期限切れの掃除

- `triggers.crons: ["0 18 * * *"]`（毎日 03:00 JST）で `scheduled` ハンドラーを動かします
  - `DELETE FROM links WHERE expires_at <= unixepoch()`
  - `DELETE FROM audit_log WHERE at <= unixepoch() - 365 * 86400`
- 期限は読み出し時にも見るので、掃除は容量のためのものです。Cron は Worker Previews では動きません（プレビューでも期限切れは開けない）

## 5. Message Editor との連携

### エディターは変えない

- 開くページが復号済みの `data` を受け取り、`EDITOR_URL#d=<data>` に移ります。エディターは今のまま `#d=` を読むだけで、`fetch` も足しません
- そのため `apps/docs/docs/message-editor/data-handling.mdx` の約束（サーバーに届かない・画面から送信しない）とテストはそのままです
- 登録時の検査は、エディターと同じ `decodePayload` / `isPayload` / `MAX_ENCODED_LENGTH` / `MAX_DECODED_BYTES` を使います。実装のときに `apps/message-editor/src/payload.ts` を `packages/`（例: `@cre/message-payload`）に切り出し、両方から使います（エディターの既存のテストが通ることを確かめる）
- セルフホストする組織は、`EDITOR_URL` を自前でデプロイした Message Editor に向けられます

### 流れ

```text
Bot ── POST /api/links（Bearer、data = #d= の値）──▶ short-url Worker ── 検査・暗号化 ──▶ D1
Bot ◀── {"url": "https://s.cre.run/<UUID>"} ──┘
Bot ── Slack の Block Kit のボタン（url = 短縮 URL）──▶ 利用者
利用者のブラウザ:
  GET /<UUID>               → 静的な HTML（どの ID でも同じ）
  GET /api/links/<UUID>     → {"editorUrl": "https://editor.cre.run/#d=…"}
  location.replace(editorUrl) → Message Editor（今のまま。#d= はサーバーに届かない）
```

### URL の長さの見積もり

| URL                                                                      | 文字数 |
| ------------------------------------------------------------------------ | ------ |
| `https://s.cre.run/` + UUID（36 文字）                                   | 54     |
| `https://short.example.com/` + UUID                                      | 62     |
| ドメインが 40 文字の場合（`https://` 8 + ドメイン 40 + `/` 1 + UUID 36） | 85     |
| （参考）今の Message Editor の URL、見本データ                           | 3,578  |

判定データの大きさによらず一定で、100 文字以内に収まります。Slack のボタン `url`（3,000）・section `text`（3,000）、Azure DevOps の PR 説明（4,000）のどれにも十分入ります。

## 6. 運用

### Worker 名・ドメイン・設定

CRE のインスタンスは Worker `cre-short`、ドメイン `s.cre.run` です。セルフホストする組織は、`name`・`routes`・`d1_databases`・`ratelimits[].namespace_id`・`vars.EDITOR_URL` を自分のものにします。

`wrangler.jsonc` の案（実装のときに作る。今はファイルを置かない）:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cre-short",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "routes": [{ "pattern": "s.cre.run", "custom_domain": true }],
  "workers_dev": false,
  "preview_urls": true,
  // 開くページ（どの ID でも同じ）。ヘッダーを付けるため、先に Worker を通す
  "assets": { "directory": "./dist", "binding": "ASSETS", "run_worker_first": true },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cre-short",
      "database_id": "<作成時の ID>",
      "migrations_dir": "migrations",
    },
  ],
  "ratelimits": [
    {
      "name": "API_RATE_LIMITER",
      "namespace_id": "<アカウント内で一意の数>",
      "simple": { "limit": 120, "period": 60 },
    },
    {
      "name": "CLIENT_RATE_LIMITER",
      "namespace_id": "<アカウント内で一意の数>",
      "simple": { "limit": 60, "period": 60 },
    },
  ],
  "triggers": { "crons": ["0 18 * * *"] },
  "vars": { "EDITOR_URL": "https://editor.cre.run/" },
  // 呼び出しのログには URL（UUID）が入るので記録しない
  "observability": { "enabled": true, "logs": { "invocation_logs": false } },
  "previews": {
    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "cre-short-preview",
        "database_id": "<作成時の ID>",
        "migrations_dir": "migrations",
      },
    ],
    "vars": { "EDITOR_URL": "https://editor.cre.run/" },
  },
}
```

前提は Workers Paid です。Free だと CPU 時間が 10 ms で、1 MB まで展開して検査する処理が収まらない可能性があり、Time Travel も 7 日になります（Free で動かすかは未決）。

### CI（実装のときに足す）

| ファイル                        | 内容                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy-short-url.yml`（新規）  | `main` への push で、ビルド → `vp exec wrangler d1 migrations apply cre-short --remote` → `vp exec wrangler deploy`                       |
| `preview-short-url.yml`（新規） | `_preview-worker.yml` を呼ぶ。`app: short-url`                                                                                            |
| `_preview-worker.yml`           | デプロイの前にプレビューの D1 にマイグレーションを流す入力（例: `migrate`）を足す。Cloudflare のシークレットが要るので `build` とは分ける |
| `preview-cleanup.yml`           | `matrix.app` に `short-url` を足す                                                                                                        |
| `e2e.yml`                       | 短縮 URL → Message Editor の E2E を足す（両方の Worker をローカルで起動する）                                                             |

- CI の `CLOUDFLARE_API_TOKEN` に D1 の編集権限が要ります（今は Workers のデプロイだけ）
- 新しい Worker なので、AGENTS.md のとおり、プレビューより先に本番へ一度デプロイして `preview_urls` を反映させます
- 判定データの検査は Message Editor と共通にするので、`packages/message-payload/**` もデプロイ・プレビューの `paths` に入れます

### PR ごとのプレビューと D1

- プレビューは、プレビュー専用の D1（`cre-short-preview`、全 PR で共有）を `previews.d1_databases` で使います。本番の D1 には触れません
- 鍵もプレビュー専用です（`wrangler preview base-config secret put LINK_MASTER_KEY`）。プレビュー用のクライアントは `clients.ts` で `cre-short-preview` に発行します
- **プレビューに実際のお客様の判定データを登録しません。** 見本データか、架空のデータだけを使います
- 共有の D1 なので、マイグレーションを含む PR は、ほかの PR のプレビューにも効きます（後方互換にする理由の 1 つ）
- Cron はプレビューでは動きません。期限切れの行は開けないまま残るので、たまに手で消します

### バックアップ

- D1 の Time Travel（Workers Paid で 30 日。常に有効で、無効にできない）だけを使い、それ以外のバックアップは取りません
- 短縮 URL は、Bot 側にある元のデータから作り直せる「期限つきのコピー」なので、失っても作り直せば済みます
- Time Travel で戻すと、データベース全体がその時点に戻ります。戻した時点より後に削除したリンクも戻るので、戻す前に `audit_log` の `link.delete`（`link_id_hash`）を書き出し、戻した後にもう一度消します

### 削除の依頼への対応

1. 短縮 URL（ID）が分かるとき: 運用者用のクライアントで `DELETE /api/links/{id}` を呼びます。すぐに開けなくなります
2. ID は分からないが、作ったクライアントと期間が分かるとき: `vp exec wrangler d1 execute cre-short --remote --command "DELETE FROM links WHERE client_id = '…' AND created_at BETWEEN … AND …"`
3. どちらも分からないとき: 中身は暗号化されていて検索できません。期限（最長 90 日）を待つか、`LINK_MASTER_KEY` を入れ替えてすべてを開けなくし、`DELETE FROM links` で消します
4. どの場合も、Time Travel には暗号文が最長 30 日残ります。読めるのは、データベースを戻し、かつ短縮 URL を知っている人だけです（鍵を入れ替えた後は誰も読めません）
5. 依頼した人には、短縮 URL を貼った先（Slack など）と、開いた人のブラウザの履歴（Message Editor の URL）には残りうることも伝えます

## 7. 脅威モデル

| 脅威                                                   | 対策                                                                                 | 残るリスク                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 短縮 URL が漏れる（転送、スクリーンショット、ログ）    | 期限（既定 30 日、最長 90 日）、削除 API、`noindex`、Worker のログに UUID を残さない | 期限内・削除前は、URL を知っている人が読める（今の `#d=` と同じ）   |
| ID の総当たり                                          | UUID v4（122 ビットの乱数）、IP ごとのレート制限、見つからない理由を返さない         | 現実的にはない                                                      |
| D1 の中身やバックアップが漏れる                        | 暗号化。鍵は MASTER と UUID から作り、UUID は保存しない                              | MASTER と、短縮 URL の両方が漏れた場合                              |
| `LINK_MASTER_KEY` が漏れる                             | 単独では読めない（UUID が要る）。入れ替えるとすべて失効する                          | 漏れた鍵と、別に漏れた URL・D1 を組み合わせた場合                   |
| クライアントの Secret が漏れる                         | クライアントごとに無効化、ハッシュだけを保存、レート制限、監査ログ、`crs_` の目印    | 無効にするまでは、登録・削除ができる（Secret では読み出せない）     |
| 自組織のドメインで偽のリンクを作られる                 | 登録は Secret を持つクライアントだけ。中身は Message Editor と同じ検査を通す         | Message Editor の URL（`#d=`）は、これまでどおり誰でも作れる        |
| 不正なデータ（`javascript:` のリンク、展開爆弾）       | 登録時にエディターと同じ検査と上限。エディターも開くときにもう一度検査する           | —                                                                   |
| オープンリダイレクト                                   | 遷移先は設定の `EDITOR_URL` だけ                                                     | —                                                                   |
| 展開ボット・クローラー・リンクの検査サービス           | 静的な HTML、302 にしない、`noindex`・`robots.txt`                                   | JavaScript を実行する検査サービスは、URL を知っていれば中身を開ける |
| 鍵を設定し忘れたまま公開する                           | 鍵がなければ保存も読み出しもできない（503）                                          | —                                                                   |
| 配信する JavaScript や Worker のコードが書き換えられる | Cloudflare アカウントの権限管理、CI の保護、外部スクリプトを読み込まない CSP         | Worker を書き換えられる人からは守れない（Web アプリ共通の限界）     |
| 使いすぎ（費用・容量）                                 | 認証、レート制限、大きさの上限、期限                                                 | Rate Limiting は近似値なので、短時間なら上限を少し超えうる          |

## 8. 採用しなかった案と理由

| 案                                                           | 採用しなかった理由                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平文（圧縮済み）のまま D1 に保存する                         | Time Travel は常に有効で無効にできず、削除しても 30 日間は平文を復元できる。D1 を読める人なら誰でも読める                                                                                                                                   |
| 登録側で暗号化し、鍵を URL のフラグメント（`#k=`）に置く     | 共有 URL は「自組織のドメイン + UUID」を基本にすると決めたため。セルフホスト・シングルテナントなので、サーバーは自組織のもの。D1 とバックアップから読めない性質は、MASTER × UUID の暗号化で保っている。必要になれば、オプションとして足せる |
| サーバーの鍵だけで暗号化する（UUID を鍵に混ぜない）          | MASTER が漏れると、D1 の中身がすべて読める                                                                                                                                                                                                  |
| 302 リダイレクトで Message Editor に送る                     | `Location` ヘッダーに判定データ全体が入り、展開ボットやリンクの検査サービスに渡る                                                                                                                                                           |
| Message Editor に `fetch` を足す（`editor.cre.run/#s=<id>`） | エディターの「画面から送信しない」という約束とテストを変えることになる。開くページが復号と遷移を担えば、エディターは変えずに済む                                                                                                            |
| HMAC 署名で認証する                                          | 検証するには、サーバーが Secret そのもの（またはそれを暗号化したもの）を持つ必要があり、「D1 にはハッシュだけ」と両立しない。TLS の上の Bearer と、無効化・レート制限で足りる                                                               |
| 共有のトークン 1 つ（Worker の Secret）で認証する            | クライアントごとの無効化と監査ができない                                                                                                                                                                                                    |
| Secret を発行する管理用の HTTP API                           | インターネットに出る攻撃面が増える。CLI と `wrangler d1 execute`（Cloudflare の権限で守られている）で足りる                                                                                                                                 |
| 短い ID（base62 で 10〜12 文字）                             | UUID でも 100 文字以内に収まり、Slack などの上限に対して長さは問題にならない。形を UUID v4 に決めておくと、ID の検査が簡単になる                                                                                                            |
| KV や R2 に保存する                                          | 期限・監査・クライアントを 1 つの D1 でまとめて扱える。KV は結果整合で、削除がすぐには効かない                                                                                                                                              |
| 論理削除（`deleted_at`）                                     | 消したデータを残しておく理由がない。消した記録は監査ログに残す                                                                                                                                                                              |

## 9. 未決事項（実装のときに決める）

- 監査ログの保存期間（案: 1 年）
- レート制限の値（案: IP ごとに 120 回 / 60 秒、クライアントごとに 60 回 / 60 秒）
- 期限内のリンクを生かしたまま鍵を入れ替える仕組み（例: `LINK_MASTER_KEY_PREVIOUS` も試す）を入れるか
- Workers Free で動かすか（CPU 時間 10 ms、Time Travel 7 日）
- 本番の `database_id` をリポジトリの `wrangler.jsonc` に書くか、CI で差し込むか
- プレビューの D1 にマイグレーションを流す具体的なコマンド（`previews.d1_databases` をどう指定するか）
- 開くページの作り方（Vite でビルドするか、手書きの静的ファイルにするか）と、`@cre/message-payload` への切り出し方
- 短縮 URL に `#p=<段落 ID>` を付けて、最初に選ぶ段落を指定できるようにするか
- フラグメントの鍵（`#k=`）を、オプションとして足すか
- リリースのときに、Message Editor のガイドから短縮 URL へ案内するか

## 10. 実装の順番（ガイドサイト駆動）

1. このガイド（`planned`）と設計を人と合意する（この PR）
2. `apps/message-editor/src/payload.ts` を `packages/` に切り出す（エディターの既存のテストが通ること）
3. 約束のテスト（`tests/data-handling.test.ts`、`e2e/guide-short-url-data-handling.e2e.ts`）と、ガイドの E2E を **赤から** 書く。`guide-promises.test.ts` を短縮 URL のガイドにも効くようにする
4. Worker・D1・CLI を実装して緑にする。`.gitignore` に `.dev.vars` を足す
5. CI（デプロイ・プレビュー・削除・E2E）を足し、本番の D1 と鍵を用意して一度デプロイする
6. ガイドの「テスト」列にバッジを置く。プロトタイプを公開して `preview` にするかは、人と合意してから
