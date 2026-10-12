import { useState } from "react";
import { CHECK_RESULT, EVIDENCE_TYPE, STANCE, STATUS, formatDate, freshness } from "../labels.ts";
import type {
  Evidence,
  EvidenceType,
  InquiryParagraph,
  ReplyParagraph,
} from "@cre/message-payload";
import { Icon, type IconName } from "./Icon.tsx";

const TYPE_ICON: Record<EvidenceType, IconName> = {
  code: "code",
  help: "book",
  faq: "book",
  terms: "doc",
  "internal-rule": "doc",
  precedent: "users",
  "case-law": "scale",
};

const EvidenceItem = ({ evidence, generatedAt }: { evidence: Evidence; generatedAt: string }) => {
  const [open, setOpen] = useState(false);
  const fresh = evidence.checkedAt ? freshness(evidence.checkedAt, generatedAt) : undefined;
  return (
    <li className="evidence">
      <span className="evidence-icon">
        <Icon name={TYPE_ICON[evidence.type]} size={18} />
      </span>
      <div className="evidence-body">
        <p className="evidence-meta">
          <span>{EVIDENCE_TYPE[evidence.type]}</span>
          <span className={`stance stance-${evidence.stance}`}>{STANCE[evidence.stance]}</span>
        </p>
        <p className="evidence-title">{evidence.title}</p>
        <p className={`evidence-date ${fresh ? `fresh-${fresh.level}` : ""}`}>
          <Icon name="clock" size={12} />
          {evidence.checkedAt && fresh
            ? `確認済み・${formatDate(evidence.checkedAt)}（${fresh.days}日前）`
            : "確認日の記録なし"}
        </p>
        {open && (
          <div className="evidence-detail">
            {evidence.excerpt && <blockquote>{evidence.excerpt}</blockquote>}
            {evidence.url ? (
              <a href={evidence.url} target="_blank" rel="noreferrer">
                {evidence.source ?? evidence.url}
              </a>
            ) : (
              evidence.source && <code>{evidence.source}</code>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="icon-button"
        aria-expanded={open}
        aria-label="根拠の詳細"
        onClick={() => setOpen(!open)}
      >
        <Icon name="chevronDown" size={14} />
      </button>
    </li>
  );
};

export const EvidencePanel = ({
  paragraph,
  index,
  total,
  questions,
  generatedAt,
}: {
  paragraph: ReplyParagraph | undefined;
  index: number;
  total: number;
  questions: InquiryParagraph[];
  generatedAt: string;
}) => {
  const [checksOpen, setChecksOpen] = useState(paragraph?.status !== "verified");
  if (!paragraph) {
    return (
      <aside className="panel">
        <h2 className="panel-title">この段落の根拠</h2>
        <p className="muted">返信の段落を選んでください。</p>
      </aside>
    );
  }
  return (
    <aside className="panel" aria-labelledby="panel-title">
      <div className="panel-head">
        <h2 id="panel-title" className="panel-title">
          この段落の根拠
        </h2>
        <Icon name="sliders" />
      </div>

      <p className="panel-position">
        <span className={`dot status-${paragraph.status}`} aria-hidden="true" />
        段落 {index + 1} / {total}
      </p>
      <h3 className="panel-topic">{paragraph.topic}</h3>

      {questions.length > 0 && (
        <blockquote className="question">
          <span className="muted small">お客様の質問</span>
          {questions.map((q) => (
            <p key={q.id}>{q.text}</p>
          ))}
        </blockquote>
      )}

      <p className="verdict">
        <span className={`status-chip status-${paragraph.status}`}>
          {STATUS[paragraph.status].icon} {STATUS[paragraph.status].label}
        </span>
        {paragraph.method && <span>{paragraph.method}</span>}
      </p>
      <p className="panel-summary">{paragraph.summary}</p>

      <div className="panel-section">
        <button
          type="button"
          className="section-toggle"
          aria-expanded={checksOpen}
          onClick={() => setChecksOpen(!checksOpen)}
        >
          確認の内訳
          <span className="muted small">
            {paragraph.checks.length}つの観点 <Icon name="chevronDown" size={12} />
          </span>
        </button>
        {checksOpen && (
          <ul className="checks">
            {paragraph.checks.map((check) => (
              <li key={check.label} className={`check result-${check.result}`}>
                <span className="check-result">{CHECK_RESULT[check.result]}</span>
                <span>
                  {check.label}
                  {check.note && <span className="check-note">{check.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {paragraph.conditions && (
        <div className="panel-section">
          <p className="muted small">適用条件</p>
          <p>{paragraph.conditions}</p>
        </div>
      )}

      <div className="panel-section">
        <p className="section-label">
          参照した根拠
          <span className="muted small">
            {paragraph.evidence.length} / {paragraph.evidence.length} 件
          </span>
        </p>
        <ul className="evidence-list">
          {paragraph.evidence.map((evidence) => (
            <EvidenceItem key={evidence.title} evidence={evidence} generatedAt={generatedAt} />
          ))}
        </ul>
      </div>

      {paragraph.nextAction && (
        <div className="panel-section next">
          <p className="section-label">
            <Icon name="check" size={14} />
            次のアクション
          </p>
          <p>{paragraph.nextAction}</p>
          {paragraph.owners && (
            <p className="muted small owners">
              <Icon name="shield" size={12} />
              {paragraph.owners.join("・")}
            </p>
          )}
        </div>
      )}
    </aside>
  );
};
