import { useEffect, useMemo, useState } from "react";
import { EvidencePanel } from "./components/EvidencePanel.tsx";
import { Icon } from "./components/Icon.tsx";
import { InquiryCard } from "./components/InquiryCard.tsx";
import { PreviewDialog } from "./components/PreviewDialog.tsx";
import { ReplyEditor } from "./components/ReplyEditor.tsx";
import { formatDotDate } from "./labels.ts";
import { decodePayload, readHash, type ReplyReviewPayload } from "@cre/editor-payload";
import { collectActions, remainingBeforeSend } from "./actions.ts";
import { isEdited } from "./paragraphs.ts";
import { samplePayload } from "./sample.ts";

type Loaded =
  | { kind: "data"; payload: ReplyReviewPayload }
  | { kind: "sample"; payload: ReplyReviewPayload }
  | { kind: "error"; message: string; payload: ReplyReviewPayload };

const load = (hash: string): Loaded => {
  const encoded = readHash(hash);
  if (!encoded) {
    return { kind: "sample", payload: samplePayload };
  }
  try {
    return { kind: "data", payload: decodePayload(encoded) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "error", message, payload: samplePayload };
  }
};

/** `#...&p=r3` で最初に選択する段落を指定できる（モック画像の撮影用） */
const initialSelection = (hash: string, payload: ReplyReviewPayload): string | undefined => {
  const requested = new URLSearchParams(hash.replace(/^#/u, "")).get("p");
  const paragraphs = payload.reply.paragraphs;
  return (paragraphs.find((p) => p.id === requested) ?? paragraphs[0])?.id;
};

/**
 * 速報モードか。データがあるときは `mode` に従う。見本データのときだけ `#mode=flash` で切り替えられる
 * （モック画像の撮影用。実データの mode を URL で上書きはしない）
 */
const isFlash = (hash: string, loaded: Loaded): boolean =>
  loaded.kind === "data"
    ? loaded.payload.mode === "flash"
    : new URLSearchParams(hash.replace(/^#/u, "")).get("mode") === "flash";

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

export const App = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const loaded = useMemo(() => load(hash), [hash]);
  const { payload } = loaded;
  const { inquiry, reply } = payload;
  const flash = isFlash(hash, loaded);

  const [selectedId, setSelectedId] = useState(() => initialSelection(hash, payload));
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setSelectedId(initialSelection(hash, payload));
    setTexts({});
    setDone(new Set());
  }, [hash, payload]);
  const toggleDone = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const editedIds = new Set(
    reply.paragraphs.filter((p) => isEdited(p, texts[p.id])).map((p) => p.id),
  );
  const groups = collectActions(reply.paragraphs, editedIds);
  const remaining = remainingBeforeSend(groups, done);
  const selected = reply.paragraphs.find((p) => p.id === selectedId);
  const questions = inquiry.paragraphs.filter((q) => selected?.respondsTo.includes(q.id));

  return (
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
            <h1>{inquiry.subject}</h1>
            <p className="lead">いつものメールを書くように。気になる段落の根拠を、すぐそばで。</p>
            {loaded.kind === "error" && (
              <p className="notice-error">
                URL のデータを読み込めませんでした（{loaded.message}）。見本データを表示しています。
              </p>
            )}
          </div>
          <div className="page-actions">
            {/* 送る前にやることは返信の一番下にあるので、残りの件数を上にも出し、押すとそこへ移動する */}
            {groups.beforeSend.length > 0 && (
              <button
                type="button"
                className={`remaining ${remaining === 0 ? "is-clear" : ""}`}
                onClick={() =>
                  document
                    .getElementById("actions")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <Icon name={remaining === 0 ? "check" : "shield"} size={14} />
                {remaining === 0 ? "送る前の確認 完了" : `送る前にやること 残り ${remaining} 件`}
              </button>
            )}
            <button type="button" className="primary" onClick={() => setPreviewOpen(true)}>
              返信プレビュー <Icon name="arrowRight" />
            </button>
          </div>
        </div>

        <div className="layout">
          <main className="main">
            <InquiryCard inquiry={inquiry} />
            <ReplyEditor
              reply={reply}
              texts={texts}
              onEdit={(id, text) => setTexts((prev) => ({ ...prev, [id]: text }))}
              selectedId={selectedId}
              onSelect={setSelectedId}
              isSample={loaded.kind !== "data"}
              done={done}
              onToggleDone={toggleDone}
              groups={groups}
              editedIds={editedIds}
            />
            <p className="muted small keep-note">
              <Icon name="clock" size={12} />
              編集内容はこの画面を開いている間のみ保持されます。
            </p>
          </main>
          <EvidencePanel
            key={selected?.id}
            paragraph={selected}
            questions={questions}
            generatedAt={payload.generatedAt}
            edited={selected ? editedIds.has(selected.id) : false}
          />
        </div>

        <footer className="footer">
          <span>
            {loaded.kind === "data"
              ? `判定: ${payload.model?.name ?? "—"}${payload.model?.version ? ` v${payload.model.version}` : ""}`
              : "デモ・問い合わせ・根拠・確認結果はすべて架空です"}
          </span>
          <span>{formatDotDate(payload.generatedAt)} 時点の判定・送信は行いません</span>
        </footer>
      </div>

      {previewOpen && (
        <PreviewDialog
          reply={reply}
          texts={texts}
          remaining={remaining}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
};
