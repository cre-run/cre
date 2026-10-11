import { EVIDENCE_TYPE, STATUS } from "../labels.ts";
import type { Reply } from "../types.ts";
import { Icon } from "./Icon.tsx";

export const ReplyEditor = ({
  reply,
  texts,
  onEdit,
  selectedId,
  onSelect,
  emphasize,
  onToggleEmphasize,
}: {
  reply: Reply;
  texts: Record<string, string>;
  onEdit: (id: string, text: string) => void;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  emphasize: boolean;
  onToggleEmphasize: () => void;
}) => {
  const paragraphs = reply.paragraphs;
  const verified = paragraphs.filter((p) => p.status === "verified").length;
  const pending = paragraphs.filter((p) => p.status !== "verified");
  const currentIndex = pending.findIndex((p) => p.id === selectedId);
  const nextPending = pending[(currentIndex + 1) % pending.length];

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
          {reply.to} <span className="muted small">サンプル</span>
        </dd>
        <dt>件名</dt>
        <dd>{reply.subject}</dd>
      </dl>

      <div className="reply-body">
        <div className="reply-toolbar">
          <span className="muted small">本文を直接編集できます</span>
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
                onBlur={(event) => onEdit(p.id, event.currentTarget.textContent ?? "")}
              >
                {texts[p.id] ?? p.text}
              </p>
              <button
                type="button"
                className="annotation"
                aria-label={`段落 ${p.topic} の根拠を見る`}
                onClick={() => onSelect(p.id)}
              >
                <span className={`status-label status-${p.status}`}>
                  <span aria-hidden="true">{STATUS[p.status].icon}</span> {STATUS[p.status].label}
                </span>
                <span className="annotation-types">{types.join("・")}</span>
              </button>
            </div>
          );
        })}

        {reply.closing && <p className="reply-plain">{reply.closing}</p>}
      </div>

      <div className="reply-foot">
        <p className="reply-progress">
          <Icon name="shield" size={14} />
          {paragraphs.length}段落のうち、{verified}段落の根拠を確認済み
        </p>
        {nextPending && (
          <button type="button" className="link-button" onClick={() => onSelect(nextPending.id)}>
            あと{pending.length}段落を確認 <Icon name="arrowRight" size={14} />
          </button>
        )}
        <p className="reply-note muted small">
          <Icon name="info" size={12} />
          右の注釈はお客様に送る文面には含まれません。
        </p>
      </div>
    </section>
  );
};
