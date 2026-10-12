import { useEffect, useMemo, useState } from "react";
import { EvidencePanel } from "./components/EvidencePanel.tsx";
import { Icon } from "./components/Icon.tsx";
import { InquiryCard } from "./components/InquiryCard.tsx";
import { PreviewDialog } from "./components/PreviewDialog.tsx";
import { ReplyEditor } from "./components/ReplyEditor.tsx";
import { formatDotDate } from "./labels.ts";
import { decodePayload, readHash, type ReplyReviewPayload } from "@cre/editor-payload";
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

  const [selectedId, setSelectedId] = useState(() => initialSelection(hash, payload));
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [emphasize, setEmphasize] = useState(false);
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

  const index = reply.paragraphs.findIndex((p) => p.id === selectedId);
  const selected = reply.paragraphs[index];
  const questions = inquiry.paragraphs.filter((q) => selected?.respondsTo.includes(q.id));

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <BrandMark />
          <span className="brand-name">CRE</span>
          <span className="divider">/</span>
          <span>Message Editor</span>
          <span className="badge">プロトタイプ</span>
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
          <button type="button" className="primary" onClick={() => setPreviewOpen(true)}>
            返信プレビュー <Icon name="arrowRight" />
          </button>
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
              emphasize={emphasize}
              onToggleEmphasize={() => setEmphasize(!emphasize)}
              isSample={loaded.kind !== "data"}
              done={done}
              onToggleDone={toggleDone}
            />
            <p className="muted small keep-note">
              <Icon name="clock" size={12} />
              編集内容はこの画面を開いている間のみ保持されます。
            </p>
          </main>
          <EvidencePanel
            key={selected?.id}
            paragraph={selected}
            index={index}
            total={reply.paragraphs.length}
            questions={questions}
            generatedAt={payload.generatedAt}
            onMove={(step) => {
              const next = reply.paragraphs[index + step];
              if (next) {
                setSelectedId(next.id);
              }
            }}
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
        <PreviewDialog reply={reply} texts={texts} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
};
