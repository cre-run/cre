import type { ReactNode } from "react";
import { formatDotDate } from "../labels.ts";
import { Icon } from "./Icon.tsx";

/** 速報モードの帯。画面の一番上に固定し、どこまでスクロールしても見えるようにする */
const FlashBanner = () => (
  <div className="flash-banner" role="status">
    <span className="flash-banner-label">
      <Icon name="bolt" size={14} />
      速報モード
    </span>
    <span className="flash-banner-text">
      {
        "速さを優先し、根拠の確認を省いた下書きです。誤りを含む可能性が高いため、そのまま送らず完成版で確かめてください。"
      }
    </span>
  </div>
);

const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 256 256" aria-hidden="true">
    <rect width="256" height="256" rx="56" fill="currentColor" />
    <g transform="translate(25.6 25.6) scale(0.8)">
      <path
        d="M 182.225 65.775 A 88 88 0 1 0 182.225 190.225 L 156.77 164.77 A 52 52 0 1 1 156.77 91.23 Z"
        fill="#fff"
      />
      <rect x="164" y="108" width="40" height="40" rx="2" fill="#42D6A4" />
    </g>
  </svg>
);

/**
 * 段落ごとの画面と下線ごとの画面で共通の外枠（上部の帯・見出し・フッター）。
 * 中身（2 列のレイアウト）と見出しの右のボタンは、それぞれの画面が渡す
 */
export const Chrome = ({
  flash,
  subject,
  lead,
  error,
  actions,
  isData,
  model,
  generatedAt,
  children,
  overlay,
}: {
  flash: boolean;
  subject: string;
  lead: string;
  /** URL のデータを読み込めなかったときの理由 */
  error?: string;
  actions: ReactNode;
  /** URL のデータを表示しているか（見本データではないか） */
  isData: boolean;
  model?: { name: string; version?: string };
  generatedAt: string;
  children: ReactNode;
  /** 画面の上に重ねるもの（返信プレビュー） */
  overlay?: ReactNode;
}) => (
  <div className={`app ${flash ? "is-flash" : ""}`}>
    {flash && <FlashBanner />}
    <header className="topbar">
      <div className="topbar-brand">
        <BrandMark />
        <span className="brand-name">CRE</span>
        <span className="divider">/</span>
        <span>Message Editor</span>
      </div>
      <div className="topbar-user">
        <span className="online" aria-hidden="true" />
        カスタマーサポート
        <span className="avatar avatar-small">CS</span>
      </div>
    </header>

    <div className="page">
      <div className="page-head">
        <div>
          <p className="breadcrumb">サポート / 返信の下書き</p>
          <h1>{subject}</h1>
          <p className="lead">{lead}</p>
          {error !== undefined && (
            <p className="notice-error">
              URL のデータを読み込めませんでした（{error}）。見本データを表示しています。
            </p>
          )}
        </div>
        <div className="page-actions">{actions}</div>
      </div>

      {children}

      <footer className="footer">
        <span>
          {isData
            ? `判定: ${model?.name ?? "—"}${model?.version ? ` v${model.version}` : ""}`
            : "デモ・問い合わせ・根拠・確認結果はすべて架空です"}
        </span>
        <span>{formatDotDate(generatedAt)} 時点の判定・送信は行いません</span>
      </footer>
    </div>

    {overlay}
  </div>
);

/** 送る前にやることの残りの件数。押すと返信の下部の「送る前にやること」へ移動する */
export const RemainingButton = ({ remaining }: { remaining: number }) => (
  <button
    type="button"
    className={`remaining ${remaining === 0 ? "is-clear" : ""}`}
    onClick={() =>
      document.getElementById("actions")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  >
    <Icon name={remaining === 0 ? "check" : "shield"} size={14} />
    {remaining === 0 ? "送る前の確認 完了" : `送る前にやること 残り ${remaining} 件`}
  </button>
);
