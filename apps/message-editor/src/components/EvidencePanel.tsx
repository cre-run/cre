import { useState } from "react";
import { CHECK_RESULT, EVIDENCE_TYPE, STANCE, STATUS, formatDate, freshness } from "../labels.ts";
import type { Evidence, EvidenceType, InquiryParagraph, ReplyParagraph } from "@cre/editor-payload";
import { hasContradiction, stanceSummary } from "../paragraphs.ts";
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

type TabId = "summary" | "assessment" | "sources" | "questions";

export const EvidencePanel = ({
  paragraph,
  questions,
  generatedAt,
  edited = false,
}: {
  paragraph: ReplyParagraph | undefined;
  questions: InquiryParagraph[];
  generatedAt: string;
  /** 本文が書き換えられているか（判定は編集前の文面に対するもの） */
  edited?: boolean;
}) => {
  // 段落を選び直すとパネルごと作り直される（App の key）ので、いつも「要点」から始まる。
  // URL のデータが変わっても段落 ID が同じだと作り直されないので、段落のデータが変わったら「要点」に戻す
  const [tab, setTab] = useState<TabId>("summary");
  const [shownParagraph, setShownParagraph] = useState(paragraph);
  if (shownParagraph !== paragraph) {
    setShownParagraph(paragraph);
    setTab("summary");
  }
  if (!paragraph) {
    return (
      <aside className="panel" aria-label="この段落の根拠">
        <p className="muted">返信の段落を選んでください。</p>
      </aside>
    );
  }
  const ok = paragraph.checks.filter((check) => check.result === "ok").length;
  // 中身が無いタブは出さない（評価が空のときに「問題なし」と誤って見せないためでもある）
  const tabs: { id: TabId; label: string; count?: string; alert?: boolean }[] = [
    { id: "summary", label: "要点" },
    ...(paragraph.checks.length > 0
      ? [
          {
            id: "assessment" as const,
            label: "評価",
            // 「観点のうち OK の数 / 観点の数」。OK 以外があるときは赤くする
            count: `${ok}/${paragraph.checks.length}`,
            alert: ok < paragraph.checks.length,
          },
        ]
      : []),
    {
      id: "sources",
      label: "出典",
      count: String(paragraph.evidence.length),
      // 主張と食い違う出典があるときは赤くする（数だけでは見落とすため）
      alert: hasContradiction(paragraph.evidence),
    },
    ...(questions.length > 0
      ? [{ id: "questions" as const, label: "質問", count: String(questions.length) }]
      : []),
  ];
  const move = (step: number) => {
    const at = tabs.findIndex((t) => t.id === tab);
    const next = tabs[(at + step + tabs.length) % tabs.length]!;
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <aside className="panel" aria-label="この段落の根拠">
      {/* タブを切り替えても、どの段落のどんな状態かは常に見えるようにする。説明はタブの中に置く */}
      <div className="panel-head">
        <h3 className="panel-topic">{paragraph.topic}</h3>
        <span className={`status-chip status-${paragraph.status}`}>
          {STATUS[paragraph.status].icon} {STATUS[paragraph.status].label}
        </span>
      </div>

      {edited && (
        <p className="panel-edited">
          <span aria-hidden="true">✎</span>
          この段落は編集済みです。確認状況と根拠は編集前の文面に対する判定なので、書き換えた内容は送る前に確かめてください。
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="段落の確認の表示">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            aria-controls="panel-tabpanel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(1);
              if (event.key === "ArrowLeft") move(-1);
            }}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`tab-count ${t.alert ? "is-alert" : ""}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div
        // パネルは選んだタブの分だけを描くので、すべてのタブが同じ 1 つのパネルを指す
        id="panel-tabpanel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="tabpanel"
      >
        {tab === "summary" && (
          <>
            <p>{paragraph.summary}</p>
            {paragraph.claims && paragraph.claims.length > 0 && (
              <div className="claims">
                <p className="claims-label">文ごとの判定</p>
                <ul>
                  {paragraph.claims.map((claim) => (
                    <li key={claim.text} className="claim-item">
                      <span className={`status-label status-${claim.status}`}>
                        <span aria-hidden="true">{STATUS[claim.status].icon}</span>{" "}
                        {STATUS[claim.status].label}
                      </span>
                      <span>
                        {claim.text}
                        {claim.note && <span className="claim-note">{claim.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(paragraph.method || paragraph.conditions || paragraph.evidence.length > 0) && (
              <dl className="panel-facts">
                {paragraph.method && (
                  <div>
                    <dt>確かめ方</dt>
                    <dd>{paragraph.method}</dd>
                  </div>
                )}
                {paragraph.conditions && (
                  <div>
                    <dt>この説明が成り立つ条件</dt>
                    <dd>{paragraph.conditions}</dd>
                  </div>
                )}
                {paragraph.evidence.length > 0 && (
                  <div>
                    <dt>根拠の内訳</dt>
                    <dd className={hasContradiction(paragraph.evidence) ? "has-contradiction" : ""}>
                      {stanceSummary(paragraph.evidence)}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            {/* 確認済みの段落は「やることがない」のが確認状況から分かるので、次のアクションは出さない */}
            {paragraph.status !== "verified" && paragraph.nextAction && (
              <div className="next">
                <p className="next-label">
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
          </>
        )}

        {tab === "assessment" && (
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

        {tab === "sources" && (
          <ul className="evidence-list">
            {paragraph.evidence.map((evidence) => (
              <EvidenceItem key={evidence.title} evidence={evidence} generatedAt={generatedAt} />
            ))}
          </ul>
        )}

        {tab === "questions" && (
          <blockquote className="question">
            {questions.map((q) => (
              <p key={q.id}>{q.text}</p>
            ))}
          </blockquote>
        )}
      </div>
    </aside>
  );
};
