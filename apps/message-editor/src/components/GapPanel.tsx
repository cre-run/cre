import { STATUS_OR_GAP } from "../labels.ts";
import type { Gap } from "@cre/editor-payload";
import { EvidenceItem } from "./EvidencePanel.tsx";
import { Icon } from "./Icon.tsx";

/**
 * 空欄（要記入）を選んだときの右パネル。判定モデルは文章を作っていないので、
 * 決める必要があること・書き起こし方の案内・根拠のある選択肢・担当だけを並べる
 */
export const GapPanel = ({ gap, generatedAt }: { gap: Gap; generatedAt: string }) => (
  <aside className="panel" aria-label="選んだ箇所の根拠">
    <div className="panel-head">
      <h3 className="panel-topic">{gap.question}</h3>
      <span className="status-chip status-gap">
        {STATUS_OR_GAP.gap.icon} {STATUS_OR_GAP.gap.label}
      </span>
    </div>
    <div className="tabpanel">
      <p>根拠が足りないため、この箇所の文章は作っていません。確かめてから書き起こしてください。</p>
      {gap.guidance && (
        <dl className="panel-facts">
          <div>
            <dt>案内</dt>
            <dd>{gap.guidance}</dd>
          </div>
        </dl>
      )}
      {gap.options && gap.options.length > 0 && (
        <section className="gap-options" aria-label="選択肢">
          <p className="claims-label">選択肢</p>
          <ol>
            {gap.options.map((option) => (
              <li key={option.label} className="gap-option">
                <p className="gap-option-label">{option.label}</p>
                {option.evidence && option.evidence.length > 0 && (
                  <ul className="evidence-list">
                    {option.evidence.map((evidence) => (
                      <EvidenceItem
                        key={evidence.title}
                        evidence={evidence}
                        generatedAt={generatedAt}
                      />
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {gap.owners && gap.owners.length > 0 && (
        <p className="muted small action-owners">
          <Icon name="users" size={12} />
          担当: {gap.owners.join("・")}
        </p>
      )}
    </div>
  </aside>
);
