import { Topbar } from "./Chrome.tsx";
import { Icon } from "./Icon.tsx";

/** 使い方のガイド（新しいデータ形式の説明） */
const GUIDE_URL = "https://docs.cre.run/message-editor";

/**
 * 廃止した形式（段落ごとに判定する version 1）の URL を開いたときの案内。
 * エラーとして扱わず、形式を廃止したことと、新しい形式への切り替え方を伝える。
 * 古いデータの中身は表示しない（読み込める形ではないため）
 */
export const RetiredNotice = ({ version }: { version: number }) => (
  <div className="app">
    <Topbar />
    <main className="page">
      <section className="card retired" aria-labelledby="retired-title">
        <p className="retired-badge">
          <Icon name="clock" size={14} />
          データ形式 version {version}
        </p>
        <h1 id="retired-title">このデータ形式は廃止されました</h1>
        <p>{`この URL には、段落ごとに確認状況を付ける以前のデータ形式（version ${version}）の判定データが入っています。この形式の表示は終了しました。`}</p>
        <p>
          {
            "新しいデータ形式（version 2）では、返信のうち確かめた部分に下線を引き、下線ごとに根拠と確認状況を表示します。根拠が足りない箇所は文章を作らず、人が書き起こす空欄にします。"
          }
        </p>
        <p>お手数ですが、判定データを新しい形式で作り直し、新しい URL を開いてください。</p>
        <div className="retired-actions">
          <a className="primary" href={GUIDE_URL} target="_blank" rel="noreferrer">
            新しいデータ形式の使い方 <Icon name="arrowRight" />
          </a>
          <a className="secondary" href="#">
            見本で新しい画面を見る
          </a>
        </div>
      </section>
    </main>
  </div>
);
