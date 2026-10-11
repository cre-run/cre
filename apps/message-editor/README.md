# @cre/message-editor

Message Editor のモック（SPA）です。返信の下書きを段落ごとに編集しながら、
各段落の確認状況（確認済み・条件あり・再確認・根拠なし）と、根拠（種類・立場・確認日時の鮮度）を表示します。

ドキュメント: `apps/docs/docs/features/message-editor.mdx`（`planned`）

## データの渡し方

バックエンドはなく、画面に渡すデータ（`src/types.ts` の `ReplyReviewPayload`）を JSON にして
pako で圧縮し、base64url で URL の `#d=` に載せます。`#...&p=r3` で最初に選ぶ段落を指定できます。
データがないときは `src/sample.ts` の見本（架空のデータ）を表示します。

```bash
vp run @cre/message-editor#dev                                              # 開発サーバー
vp run @cre/message-editor#encode -- payload.json --base http://localhost:5173/   # JSON から URL を作る
vp run @cre/message-editor#encode                                           # 見本データの URL
vp run @cre/message-editor#test
vp run @cre/message-editor#build
```

## ドキュメントのモック画像

`apps/docs/docs/features/message-editor*.png` は、見本データを表示した画面のスクリーンショットです。
撮影方法（E2E での自動撮影など）はまだ決まっていないため、現状は手動で撮り直します。

1. `vp run @cre/message-editor#build` のあと `vp run @cre/message-editor#preview`
2. `/#p=r1`（`message-editor.png`）と `/#p=r3`（`message-editor-recheck.png`）を開く
3. 幅 1440px・デバイスピクセル比 2 で撮影し、同じファイル名で上書きする
