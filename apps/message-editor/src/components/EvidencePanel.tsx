import { type ReactNode, useState } from "react";
import { CHECK_RESULT, EVIDENCE_TYPE, STANCE, STATUS, formatDate, freshness } from "../labels.ts";
import type { Evidence, EvidenceType, InquiryParagraph, ReplyParagraph } from "@cre/editor-payload";
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

/** 折りたたみの区画。隠してよい情報は閉じておき、見出しの右に中身の要約を出す */
const Section = ({
  title,
  hint,
  defaultOpen,
  children,
}: {
  title: string;
  hint: string;
  defaultOpen: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-section">
      <button
        type="button"
        className="section-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {title}
        <span className="muted small">
          {hint} <Icon name={open ? "chevronUp" : "chevronDown"} size={12} />
        </span>
      </button>
      {open && children}
    </div>
  );
};

export const EvidencePanel = ({
  paragraph,
  questions,
  generatedAt,
}: {
  paragraph: ReplyParagraph | undefined;
  questions: InquiryParagraph[];
  generatedAt: string;
}) => {
  if (!paragraph) {
    return (
      <aside className="panel" aria-label="この段落の根拠">
        <p className="muted">返信の段落を選んでください。</p>
      </aside>
    );
  }
  const ng = paragraph.checks.filter((check) => check.result === "ng").length;
  const warn = paragraph.checks.filter((check) => check.result === "warn").length;
  const checksHint =
    ng + warn === 0
      ? `${paragraph.checks.length}つの観点・すべて OK`
      : [ng > 0 && `NG ${ng}`, warn > 0 && `要確認 ${warn}`].filter(Boolean).join("・");

  return (
    <aside className="panel" aria-label="この段落の根拠">
      {/* 見出しや段落番号は置かず、要点から始める: 見出し → 確認状況 → ひとこと → 適用条件 */}
      <h3 className="panel-topic">{paragraph.topic}</h3>
      <p className="verdict">
        <span className={`status-chip status-${paragraph.status}`}>
          {STATUS[paragraph.status].icon} {STATUS[paragraph.status].label}
        </span>
        {paragraph.method && <span className="muted small">{paragraph.method}</span>}
      </p>
      <p className="panel-summary">{paragraph.summary}</p>
      {paragraph.conditions && (
        <p className="panel-conditions">
          <span className="muted">適用条件</span>
          {paragraph.conditions}
        </p>
      )}

      {/* 確認済みの段落は「やることがない」のが確認状況から分かるので、次のアクションは出さない */}
      {paragraph.status !== "verified" && paragraph.nextAction && (
        <div className="next">
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

      {questions.length > 0 && (
        <Section title="お客様の質問" hint={`${questions.length}件`} defaultOpen={false}>
          <blockquote className="question">
            {questions.map((q) => (
              <p key={q.id}>{q.text}</p>
            ))}
          </blockquote>
        </Section>
      )}

      {/* NG・要確認があるときだけ最初から開き、問題がなければ要約だけ見せる */}
      <Section title="確認の内訳" hint={checksHint} defaultOpen={ng + warn > 0}>
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
      </Section>

      <div className="panel-section">
        <p className="section-label">
          参照した根拠
          <span className="muted small">{paragraph.evidence.length}件</span>
        </p>
        <ul className="evidence-list">
          {paragraph.evidence.map((evidence) => (
            <EvidenceItem key={evidence.title} evidence={evidence} generatedAt={generatedAt} />
          ))}
        </ul>
      </div>
    </aside>
  );
};
