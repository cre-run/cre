import type { KeyboardEvent, ReactNode } from "react";
import { STATUS } from "../labels.ts";
import { itemStatusCounts, nextWith, type ItemStatus, type ReplyItem } from "../reader.ts";
import type { Assertion, Gap, Reply } from "@cre/editor-payload";
import { Icon } from "./Icon.tsx";

/** 下線・空欄はクリックのほか、Tab で移動して Enter・Space でも選べるようにする */
const selectable = (selected: boolean, onSelect: () => void) => ({
  role: "button",
  tabIndex: 0,
  "aria-pressed": selected,
  onClick: (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelect();
  },
  onKeyDown: (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  },
});

/**
 * 判定した本文の一部。状態の色の下線を引き、すぐ後ろに確認状況のラベルを付ける。
 * 確認済みはラベルを ✓ だけにして、確かめが必要な箇所のラベルが目立つようにする
 */
const AssertionMark = ({
  assertion,
  selected,
  onSelect,
}: {
  assertion: Assertion;
  selected: boolean;
  onSelect: () => void;
}) => {
  const { label, icon } = STATUS[assertion.status];
  return (
    <mark
      id={`item-${assertion.id}`}
      className={`assertion status-${assertion.status} ${selected ? "is-focused" : ""}`}
      title={assertion.topic}
      {...selectable(selected, onSelect)}
    >
      {assertion.text}
      <span className={`assertion-label status-${assertion.status}`}>
        <span aria-hidden="true">{icon}</span>
        {assertion.status === "verified" ? (
          <span className="visually-hidden">{label}</span>
        ) : (
          ` ${label}`
        )}
      </span>
    </mark>
  );
};

/** 根拠が足りず、文章を作っていない空欄。決める必要があることを枠の中に書く */
const GapBox = ({
  gap,
  selected,
  onSelect,
}: {
  gap: Gap;
  selected: boolean;
  onSelect: () => void;
}) => (
  <span
    id={`item-${gap.id}`}
    className={`gap ${selected ? "is-focused" : ""}`}
    {...selectable(selected, onSelect)}
  >
    <span className="assertion-label status-gap">
      <span aria-hidden="true">{STATUS.gap.icon}</span> {STATUS.gap.label}
    </span>
    <span className="gap-question">{gap.question}</span>
  </span>
);

/** 状態ごとの箇所の数。押すと、その状態の箇所へ順に移動する */
const ItemSummary = ({
  items,
  focusedId,
  onFocus,
}: {
  items: ReplyItem[];
  focusedId: string | undefined;
  onFocus: (id: string) => void;
}) => {
  const jump = (status: ItemStatus) => {
    const next = nextWith(items, (item) => item.status === status, focusedId);
    if (next) {
      onFocus(next.id);
    }
  };
  return (
    <div className="status-summary" role="group" aria-label="確認状況の内訳">
      {itemStatusCounts(items).map(({ status, count }) => (
        <button
          key={status}
          type="button"
          className={`status-chip status-${status}`}
          title={`${STATUS[status].label}の箇所へ移動`}
          onClick={() => jump(status)}
        >
          <span aria-hidden="true">{STATUS[status].icon}</span> {STATUS[status].label}{" "}
          <span className="status-count">{count}</span>
        </button>
      ))}
    </div>
  );
};

/** 返信。本文は読み取り専用で、下線と空欄を選べる */
export const ReplyReader = ({
  reply,
  items,
  focusedId,
  onFocus,
  isSample,
  children,
}: {
  reply: Reply;
  items: ReplyItem[];
  focusedId: string | undefined;
  onFocus: (id: string) => void;
  /** 見本データを表示しているとき */
  isSample: boolean;
  /** 返信の下部に置くもの（送る前にやること） */
  children: ReactNode;
}) => (
  <section className="card reply" aria-labelledby="reply-title">
    <div className="reply-head">
      <h2 id="reply-title">
        <Icon name="chat" />
        返信
      </h2>
      <span className="muted small">読み取り専用・下線を選ぶと根拠を表示</span>
    </div>
    <ItemSummary items={items} focusedId={focusedId} onFocus={onFocus} />

    <dl className="reply-fields">
      <dt>宛先</dt>
      <dd>
        {reply.to} {isSample && <span className="muted small">サンプル</span>}
      </dd>
      <dt>件名</dt>
      <dd>{reply.subject}</dd>
    </dl>

    <div className="reply-body">
      {reply.opening && <p className="reply-plain">{reply.opening}</p>}
      {reply.paragraphs.map((paragraph) => (
        <p key={paragraph.id} id={`paragraph-${paragraph.id}`} className="reader-paragraph">
          {paragraph.parts.map((part, i) =>
            "text" in part ? (
              part.text
            ) : "assertion" in part ? (
              <AssertionMark
                key={i}
                assertion={part.assertion}
                selected={part.assertion.id === focusedId}
                onSelect={() => onFocus(part.assertion.id)}
              />
            ) : (
              <GapBox
                key={i}
                gap={part.gap}
                selected={part.gap.id === focusedId}
                onSelect={() => onFocus(part.gap.id)}
              />
            ),
          )}
        </p>
      ))}
      {reply.closing && <p className="reply-plain">{reply.closing}</p>}
    </div>

    <div className="reply-foot">{children}</div>
  </section>
);
