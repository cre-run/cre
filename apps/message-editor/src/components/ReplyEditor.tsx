import { collectActions } from "../actions.ts";
import { EVIDENCE_TYPE, STATUS } from "../labels.ts";
import type { Reply } from "@cre/editor-payload";
import { ActionList } from "./ActionList.tsx";
import { Icon } from "./Icon.tsx";

export const ReplyEditor = ({
  reply,
  texts,
  onEdit,
  selectedId,
  onSelect,
  emphasize,
  onToggleEmphasize,
  isSample,
  done,
  onToggleDone,
}: {
  reply: Reply;
  texts: Record<string, string>;
  onEdit: (id: string, text: string) => void;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  emphasize: boolean;
  onToggleEmphasize: () => void;
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
        <div className="reply-toolbar">
          <span className="muted small">
            本文を直接編集できます。段落の下の注釈はお客様に送る文面には含まれません
          </span>
          <button
            type="button"
            className={`toggle ${emphasize ? "is-on" : ""}`}
            aria-pressed={emphasize}
            onClick={onToggleEmphasize}
          >
            <Icon name="shield" size={14} />
            要確認を強調
          </button>
        </div>

        {reply.opening && <p className="reply-plain">{reply.opening}</p>}

        {paragraphs.map((p) => {
          const types = [...new Set(p.evidence.map((e) => EVIDENCE_TYPE[e.type]))];
          const selected = p.id === selectedId;
          const dimmed = emphasize && p.status === "verified";
          return (
            <div
              key={p.id}
              className={`paragraph status-${p.status} ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""}`}
              onClick={() => onSelect(p.id)}
            >
              <p
                className="paragraph-text"
                contentEditable
                suppressContentEditableWarning
                onFocus={() => onSelect(p.id)}
                onBlur={(event) => onEdit(p.id, event.currentTarget.innerText)}
              >
                {texts[p.id] ?? p.text}
              </p>
              {/* 段落の直下に 1 行で、確認状況と根拠の種類を示す（右の根拠パネルへの入口） */}
              <button
                type="button"
                className="annotation"
                aria-label={`段落 ${p.topic} の根拠を見る`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(p.id)}
              >
                <span className={`status-label status-${p.status}`}>
                  <span aria-hidden="true">{STATUS[p.status].icon}</span> {STATUS[p.status].label}
                </span>
                <span className="annotation-types">{types.join("・")}</span>
                <span className="annotation-cta" aria-hidden="true">
                  {selected ? "根拠を表示中" : "根拠を見る"}
                  {!selected && <Icon name="arrowRight" size={12} />}
                </span>
              </button>
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
