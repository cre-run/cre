import { collectActions } from "../actions.ts";
import { STATUS } from "../labels.ts";
import type { Reply } from "@cre/editor-payload";
import { ActionList } from "./ActionList.tsx";
import { Icon } from "./Icon.tsx";

export const ReplyEditor = ({
  reply,
  texts,
  onEdit,
  selectedId,
  onSelect,
  isSample,
  done,
  onToggleDone,
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

      <dl className="reply-fields">
        <dt>宛先</dt>
        <dd>
          {reply.to} {isSample && <span className="muted small">サンプル</span>}
        </dd>
        <dt>件名</dt>
        <dd>{reply.subject}</dd>
      </dl>

      <div className="reply-body">
        <p className="reply-toolbar muted small">
          本文を直接編集できます。段落の右上の確認状況と右の根拠は、お客様に送る文面には含まれません
        </p>

        {reply.opening && <p className="reply-plain">{reply.opening}</p>}

        {paragraphs.map((p) => {
          const selected = p.id === selectedId;
          return (
            <div
              key={p.id}
              className={`paragraph status-${p.status} ${selected ? "is-selected" : ""}`}
              aria-label={`段落 ${p.topic}`}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(p.id)}
            >
              {/* 全段落の確認状況をひと目で追えるよう、アイコンと色付きの文字だけを目印として本文の上に置く。詳しくは右のパネル */}
              <span className={`status-label status-${p.status}`}>
                <span aria-hidden="true">{STATUS[p.status].icon}</span> {STATUS[p.status].label}
              </span>
              <p
                className="paragraph-text"
                contentEditable
                suppressContentEditableWarning
                onFocus={() => onSelect(p.id)}
                onBlur={(event) => onEdit(p.id, event.currentTarget.innerText)}
              >
                {texts[p.id] ?? p.text}
              </p>
            </div>
          );
        })}

        {reply.closing && <p className="reply-plain">{reply.closing}</p>}
      </div>

      <div className="reply-foot">
        <ActionList
          groups={collectActions(paragraphs)}
          done={done}
          onToggle={onToggleDone}
          onSelect={onSelect}
        />
      </div>
    </section>
  );
};
