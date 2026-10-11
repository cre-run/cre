# CRE ブランドアセット

Open Orbit の A1 / A3 を SVG として清書したアセットです。
生成した比較ボードをもとに、形状を幾何学的に整えています。

| 案             | コンセプト                 | シンボル                    | 文字付きロゴ            | Avatar                      | Favicon                       |
| -------------- | -------------------------- | --------------------------- | ----------------------- | --------------------------- | ----------------------------- |
| A1 — Satellite | C の開口部に四角を配置     | [symbol.svg](a1/symbol.svg) | [logo.svg](a1/logo.svg) | [avatar.svg](a1/avatar.svg) | [favicon.svg](a1/favicon.svg) |
| A3 — Focus     | C の内側の中心に四角を配置 | [symbol.svg](a3/symbol.svg) | [logo.svg](a3/logo.svg) | [avatar.svg](a3/avatar.svg) | [favicon.svg](a3/favicon.svg) |

## 仕様

- ネイビー: `#071B3D`、ミント: `#42D6A4`、白: `#FFFFFF`。
- シンボルは 256 × 256、文字付きロゴは 480 × 256。背景は透明で、明るい背景向けです。
- A1 の `symbol-mono.svg` は C を `currentColor` で描いた単色版です。HTML に埋め込むと文字色に合わせて白黒が切り替わるため、ダークモードのあるサイトのヘッダーなどに使います（`apps/docs` のロゴで使用）。
- Avatar は 256 × 256。ネイビーの角丸背景と白い C を使い、周囲に余白を設けています。
- Favicon は 32 × 32 の表示サイズを指定した SVG。拡大縮小可能な `viewBox` を備えています。
- 文字もパスで描画しており、外部フォント・画像・スクリプトへの依存はありません。
- 各ファイルに `title` とアクセシブルな名前を設定しています。HTML の `img` で使う場合は用途に応じた `alt` を指定してください。

## 使用例

アプリの公開ディレクトリからシンボリックリンクを張って参照します（`apps/lp` と `apps/docs` のファビコンはこの方法です）。

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<img src="/logo.svg" alt="CRE" width="240" height="128" />
```

GitHub の Avatar に登録するときは、選んだ `avatar.svg` を PNG に書き出してください。
このディレクトリは静的アセット集で、ビルドや依存パッケージのインストールは不要です。
