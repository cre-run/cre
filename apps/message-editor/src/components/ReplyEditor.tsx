import type { ActionGroups } from "../actions.ts";
import { STATUS } from "../labels.ts";
import { nextWith, splitByClaims, statusCounts } from "../paragraphs.ts";
import type { ParagraphStatus, Reply, ReplyParagraph } from "@cre/editor-payload";
import { ActionList } from "./ActionList.tsx";
import { Icon } from "./Icon.tsx";

/** 段落の本文。確認済み以外の文には、その状態の色で印を付ける */
const ParagraphBody = ({ paragraph }: { paragraph: ReplyParagraph }) =>
  splitByClaims(paragraph.text, paragraph.claims).map((segment, i) =>
    segment.claim ? (
      <mark key={i} className={`claim status-${segment.claim.status}`} title={segment.claim.note}>
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  );

/** 状態ごとの段落の数。押すと、その状態の段落へ順に移動する */
const StatusSummary = ({
  paragraphs,
  editedIds,
  selectedId,
  onSelect,
}: {
  paragraphs: ReplyParagraph[];
  editedIds: Set<string>;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) => {
  const jump = (matches: (p: ReplyParagraph) => boolean) => {
    const next = nextWith(paragraphs, matches, selectedId);
    if (next) {
      onSelect(next.id);
      document.getElementById(`paragraph-${next.id}`)?.scrollIntoView({ block: "nearest" });
    }
  };
  const byStatus = (status: ParagraphStatus) => (p: ReplyParagraph) => p.status === status;
  return (
    <div className="status-summary" role="group" aria-label="確認状況の内訳">
      {statusCounts(paragraphs).map(({ status, count }) => (
        <button
          key={status}
          type="button"
          className={`status-chip status-${status}`}
          title={`${STATUS[status].label}の段落へ移動`}
          onClick={() => jump(byStatus(status))}
        >
          <span aria-hidden="true">{STATUS[status].icon}</span> {STATUS[status].label}{" "}
          <span className="status-count">{count}</span>
        </button>
      ))}
      {editedIds.size > 0 && (
        <button
          type="button"
          className="status-chip status-edited"
          title="編集済みの段落へ移動"
          onClick={() => jump((p) => editedIds.has(p.id))}
        >
          <span aria-hidden="true">✎</span> 編集済み{" "}
          <span className="status-count">{editedIds.size}</span>
        </button>
      )}
    </div>
  );
};

export const ReplyEditor = ({
  reply,
  texts,
  onEdit,
  selectedId,
  onSelect,
  isSample,
  done,
  onToggleDone,
  groups,
  editedIds,
}: {
  reply: Reply;
  texts: Record<string, string>;
  onEdit: (id: string, text: string) => void;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** 見本データを表示しているとき（URL のデータがない・読み込めない） */
  isSample: boolean;
  /** アクションを確認済みにした段落 ID（画面を開いている間だけ保持） */
  done: Set<string>;
  onToggleDone: (paragraphId: string) => void;
  /** 改善アクション（送る前／送った後） */
  groups: ActionGroups;
  /** 本文を書き換えた段落 ID */
  editedIds: Set<string>;
}) => {
  const paragraphs = reply.paragraphs;

  return (
    <section className="card reply" aria-labelledby="reply-title">
      <div className="reply-head">
        <h2 id="reply-title">
          <Icon name="chat" />
          返信
        </h2>
        <span className="muted small">下書き・この画面で編集中</span>
      </div>
      <StatusSummary
        paragraphs={paragraphs}
        editedIds={editedIds}
        selectedId={selectedId}
        onSelect={onSelect}
      />

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

        {paragraphs.map((p) => {
          const selected = p.id === selectedId;
          const edited = editedIds.has(p.id);
          return (
            <div
              key={p.id}
              id={`paragraph-${p.id}`}
              className={`paragraph status-${p.status} ${selected ? "is-selected" : ""}`}
              aria-label={`段落 ${p.topic}`}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(p.id)}
            >
              {/* 全段落の確認状況をひと目で追えるよう、アイコンと色付きの文字だけを目印として本文の上に置く。詳しくは右のパネル */}
              <span className="paragraph-chips">
                {/* 送る前にやることでチェックを付けた段落。済んだかどうかを本文の側でも分かるようにする */}
                {done.has(p.id) && (
                  <span className="status-chip status-done">
                    <span aria-hidden="true">✓</span> 確認した
                  </span>
                )}
                {edited && (
                  <span className="status-chip status-edited">
                    <span aria-hidden="true">✎</span> 編集済み
                  </span>
                )}
                <span className={`status-chip status-${p.status}`}>
                  <span aria-hidden="true">{STATUS[p.status].icon}</span> {STATUS[p.status].label}
                </span>
              </span>
              <p
                // 編集済みになったら作り直す。文ごとの印（mark）を消すときに、ブラウザが書き換えた DOM と React の差分がぶつからないようにする
                key={edited ? "edited" : "original"}
                className="paragraph-text"
                contentEditable
                suppressContentEditableWarning
                onFocus={() => onSelect(p.id)}
                onBlur={(event) => onEdit(p.id, event.currentTarget.innerText)}
              >
                {edited ? texts[p.id] : <ParagraphBody paragraph={p} />}
              </p>
            </div>
          );
        })}

        {reply.closing && <p className="reply-plain">{reply.closing}</p>}
      </div>

      <div className="reply-foot">
        <ActionList groups={groups} done={done} onToggle={onToggleDone} onSelect={onSelect} />
      </div>
    </section>
  );
};
