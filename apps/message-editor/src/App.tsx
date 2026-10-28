import { useEffect, useMemo, useState } from "react";
import { Chrome, RemainingButton } from "./components/Chrome.tsx";
import { EvidencePanel } from "./components/EvidencePanel.tsx";
import { Icon } from "./components/Icon.tsx";
import { InquiryCard } from "./components/InquiryCard.tsx";
import { PreviewDialog } from "./components/PreviewDialog.tsx";
import { ReplyEditor } from "./components/ReplyEditor.tsx";
import { ReaderScreen } from "./ReaderScreen.tsx";
import type { ReplyReviewPayload } from "@cre/editor-payload";
import { collectActions, remainingBeforeSend } from "./actions.ts";
import { isEdited } from "./paragraphs.ts";
import { hashParam, isFlash, load, type Loaded } from "./load.ts";

/**
 * 判定データの version で画面を切り替える。
 * version 1 は段落ごとの画面（編集できる）、version 2 は下線ごとの画面（読み取り専用）。
 */
export const App = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const loaded = useMemo(() => load(hash), [hash]);
  const { payload } = loaded;
  return payload.version === 2 ? (
    // 箇所の選択などは URL のデータごとに作り直す
    <ReaderScreen key={hash} hash={hash} loaded={loaded} payload={payload} />
  ) : (
    <EditorScreen hash={hash} loaded={loaded} payload={payload} />
  );
};

/** `#...&p=r3` で最初に選択する段落を指定できる（モック画像の撮影用） */
const initialSelection = (hash: string, payload: ReplyReviewPayload): string | undefined => {
  const requested = hashParam(hash, "p");
  const paragraphs = payload.reply.paragraphs;
  return (paragraphs.find((p) => p.id === requested) ?? paragraphs[0])?.id;
};

/** 段落ごとの画面（判定データ version 1） */
const EditorScreen = ({
  hash,
  loaded,
  payload,
}: {
  hash: string;
  loaded: Loaded;
  payload: ReplyReviewPayload;
}) => {
  const { inquiry, reply } = payload;

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
    <Chrome
      flash={isFlash(hash, loaded)}
      subject={inquiry.subject}
      lead="いつものメールを書くように。気になる段落の根拠を、すぐそばで。"
      error={loaded.kind === "error" ? loaded.message : undefined}
      isData={loaded.kind === "data"}
      model={payload.model}
      generatedAt={payload.generatedAt}
      actions={
        <>
          {/* 送る前にやることは返信の一番下にあるので、残りの件数を上にも出し、押すとそこへ移動する */}
          {groups.beforeSend.length > 0 && <RemainingButton remaining={remaining} />}
          <button type="button" className="primary" onClick={() => setPreviewOpen(true)}>
            返信プレビュー <Icon name="arrowRight" />
          </button>
        </>
      }
      overlay={
        previewOpen && (
          <PreviewDialog
            reply={reply}
            paragraphs={reply.paragraphs.map((p) => texts[p.id] ?? p.text)}
            remaining={remaining}
            onClose={() => setPreviewOpen(false)}
          />
        )
      }
    >
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
    </Chrome>
  );
};
