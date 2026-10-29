import { useEffect, useMemo, useState } from "react";
import { ActionList } from "./components/ActionList.tsx";
import { Chrome, RemainingButton } from "./components/Chrome.tsx";
import { EvidencePanel } from "./components/EvidencePanel.tsx";
import { GapPanel } from "./components/GapPanel.tsx";
import { Icon } from "./components/Icon.tsx";
import { InquiryCard } from "./components/InquiryCard.tsx";
import { PreviewDialog } from "./components/PreviewDialog.tsx";
import { ReplyReader } from "./components/ReplyReader.tsx";
import { RetiredNotice } from "./components/RetiredNotice.tsx";
import type { ReplyReviewPayload } from "@cre/editor-payload";
import { collectActions, remainingBeforeSend } from "./actions.ts";
import { hashParam, isFlash, load, type Loaded } from "./load.ts";
import { gapCount, initialFocus, paragraphText, replyItems } from "./reader.ts";

export const App = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const loaded = useMemo(() => load(hash), [hash]);
  // 廃止した形式の URL はエラーにせず、新しい形式への切り替えを案内する
  if (loaded.kind === "retired") {
    return <RetiredNotice version={loaded.version} />;
  }
  return <Screen key={hash} hash={hash} loaded={loaded} payload={loaded.payload} />;
};

/**
 * 返信の画面。本文は読み取り専用で、下線・空欄を選ぶと、右側にその箇所の根拠を表示する。
 * 箇所の選択やチェックは URL のデータごとに作り直す（App の key）
 */
const Screen = ({
  hash,
  loaded,
  payload,
}: {
  hash: string;
  loaded: Exclude<Loaded, { kind: "retired" }>;
  payload: ReplyReviewPayload;
}) => {
  const { inquiry, reply } = payload;
  const items = replyItems(reply);
  const [focusedId, setFocusedId] = useState(() => initialFocus(items, hashParam(hash, "f")));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(() => new Set());
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

  const groups = collectActions(items);
  const remaining = remainingBeforeSend(groups, done);
  const focused = items.find((item) => item.id === focusedId);
  const paragraph = reply.paragraphs.find((p) => p.id === focused?.paragraphId);
  const questions = inquiry.paragraphs.filter((q) => paragraph?.respondsTo.includes(q.id));

  /** 箇所を選び、本文の中のその箇所が見えるようにする */
  const focus = (id: string) => {
    setFocusedId(id);
    document.getElementById(`item-${id}`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <Chrome
      flash={isFlash(hash, loaded)}
      subject={inquiry.subject}
      lead="確かめた部分に下線を。下線ごとの根拠を、すぐそばで。"
      error={loaded.kind === "error" ? loaded.message : undefined}
      isData={loaded.kind === "data"}
      model={payload.model}
      generatedAt={payload.generatedAt}
      actions={
        <>
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
            paragraphs={reply.paragraphs.map(paragraphText)}
            remaining={remaining}
            gaps={gapCount(items)}
            onClose={() => setPreviewOpen(false)}
          />
        )
      }
    >
      <div className="layout">
        <main className="main">
          <InquiryCard inquiry={inquiry} />
          <ReplyReader
            reply={reply}
            items={items}
            focusedId={focusedId}
            onFocus={focus}
            isSample={loaded.kind !== "data"}
          >
            <ActionList groups={groups} done={done} onToggle={toggleDone} onSelect={focus} />
          </ReplyReader>
        </main>
        {focused?.kind === "gap" ? (
          <GapPanel key={focused.id} gap={focused.gap} generatedAt={payload.generatedAt} />
        ) : (
          <EvidencePanel
            key={focused?.id}
            assertion={focused?.assertion}
            questions={questions}
            generatedAt={payload.generatedAt}
          />
        )}
      </div>
    </Chrome>
  );
};
