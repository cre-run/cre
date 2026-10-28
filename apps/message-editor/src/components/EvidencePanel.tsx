import { useState } from "react";
import { CHECK_RESULT, EVIDENCE_TYPE, STANCE, STATUS, formatDate, freshness } from "../labels.ts";
import type { Assertion, Evidence, EvidenceType, InquiryParagraph } from "@cre/editor-payload";
import { hasContradiction, stanceSummary } from "../evidence.ts";
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

export const EvidenceItem = ({
  evidence,
  generatedAt,
}: {
  evidence: Evidence;
  generatedAt: string;
}) => {
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

/** 選んだ下線の根拠。空欄を選んだときは GapPanel を出す */
export const EvidencePanel = ({
  assertion,
  questions,
  generatedAt,
}: {
  assertion: Assertion | undefined;
  /** 下線を含む段落が答えている、お客様の質問 */
  questions: InquiryParagraph[];
  generatedAt: string;
}) => {
  // 箇所を選び直すとパネルごと作り直される（App の key）ので、いつも「要点」から始まる。
  // URL のデータが変わっても ID が同じだと作り直されないので、下線のデータが変わったら「要点」に戻す
  const [tab, setTab] = useState<TabId>("summary");
  const [shown, setShown] = useState(assertion);
  if (shown !== assertion) {
    setShown(assertion);
    setTab("summary");
  }
  if (!assertion) {
    return (
      <aside className="panel" aria-label="選んだ箇所の根拠">
        <p className="muted">返信の下線か空欄を選んでください。</p>
      </aside>
    );
  }
  const ok = assertion.checks.filter((check) => check.result === "ok").length;
  // 中身が無いタブは出さない（評価が空のときに「問題なし」と誤って見せないためでもある）
  const tabs: { id: TabId; label: string; count?: string; alert?: boolean }[] = [
    { id: "summary", label: "要点" },
    ...(assertion.checks.length > 0
      ? [
          {
            id: "assessment" as const,
            label: "評価",
            // 「観点のうち OK の数 / 観点の数」。OK 以外があるときは赤くする
            count: `${ok}/${assertion.checks.length}`,
            alert: ok < assertion.checks.length,
          },
        ]
      : []),
    {
      id: "sources",
      label: "出典",
      count: String(assertion.evidence.length),
      // 主張と食い違う出典があるときは赤くする（数だけでは見落とすため）
      alert: hasContradiction(assertion.evidence),
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
    <aside className="panel" aria-label="選んだ箇所の根拠">
      {/* タブを切り替えても、どの下線のどんな状態かは常に見えるようにする。説明はタブの中に置く */}
      <div className="panel-head">
        <h3 className="panel-topic">{assertion.topic}</h3>
        <span className={`status-chip status-${assertion.status}`}>
          {STATUS[assertion.status].icon} {STATUS[assertion.status].label}
        </span>
      </div>

      <div className="tabs" role="tablist" aria-label="下線の確認の表示">
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
            <p>{assertion.summary}</p>
            {(assertion.method || assertion.conditions) && (
              <dl className="panel-facts">
                {assertion.method && (
                  <div>
                    <dt>確かめ方</dt>
                    <dd>{assertion.method}</dd>
                  </div>
                )}
                {assertion.conditions && (
                  <div>
                    <dt>この説明が成り立つ条件</dt>
                    <dd>{assertion.conditions}</dd>
                  </div>
                )}
              </dl>
            )}
            {/* 取るべきアクションと担当は、返信の下部の「送る前にやること」にまとめて出す（ここでは繰り返さない） */}
          </>
        )}

        {tab === "assessment" && (
          <ul className="checks">
            {assertion.checks.map((check) => (
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
          <>
            {assertion.evidence.length > 0 && (
              <p
                className={`sources-summary ${hasContradiction(assertion.evidence) ? "has-contradiction" : ""}`}
              >
                {stanceSummary(assertion.evidence)}
              </p>
            )}
            <ul className="evidence-list">
              {assertion.evidence.map((evidence) => (
                <EvidenceItem key={evidence.title} evidence={evidence} generatedAt={generatedAt} />
              ))}
            </ul>
          </>
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
