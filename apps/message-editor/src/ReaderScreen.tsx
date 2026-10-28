import { useState } from "react";
import { ActionList } from "./components/ActionList.tsx";
import { Chrome, RemainingButton } from "./components/Chrome.tsx";
import { EvidencePanel } from "./components/EvidencePanel.tsx";
import { GapPanel } from "./components/GapPanel.tsx";
import { Icon } from "./components/Icon.tsx";
import { InquiryCard } from "./components/InquiryCard.tsx";
import { PreviewDialog } from "./components/PreviewDialog.tsx";
import { ReplyReader } from "./components/ReplyReader.tsx";
import type { ReplyReviewPayloadV2 } from "@cre/editor-payload";
import { remainingBeforeSend } from "./actions.ts";
import { hashParam, isFlash, type Loaded } from "./load.ts";
import { collectItemActions, gapCount, initialFocus, paragraphText, replyItems } from "./reader.ts";

/**
 * 下線ごとの画面（判定データ version 2）。本文は読み取り専用で、
 * 下線・空欄を選ぶと、右側にその箇所の根拠を表示する
 */
export const ReaderScreen = ({
  hash,
  loaded,
  payload,
}: {
  hash: string;
  loaded: Loaded;
  payload: ReplyReviewPayloadV2;
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

  const groups = collectItemActions(items);
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
            <ActionList
              groups={groups}
              done={done}
              onToggle={toggleDone}
              onSelect={focus}
              selectLabel="箇所を見る"
            />
          </ReplyReader>
        </main>
        {focused?.kind === "gap" ? (
          <GapPanel key={focused.id} gap={focused.gap} generatedAt={payload.generatedAt} />
        ) : (
          <EvidencePanel
            key={focused?.id}
            paragraph={focused?.assertion}
            questions={questions}
            generatedAt={payload.generatedAt}
            label="選んだ箇所の根拠"
          />
        )}
      </div>
    </Chrome>
  );
};
