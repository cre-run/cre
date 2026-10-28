import { useEffect, useState } from "react";
import { Icon } from "./Icon.tsx";

type CopyState = "idle" | "copied" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "本文をコピー",
  copied: "コピーしました",
  failed: "コピーできませんでした",
};

/** お客様に送る文面だけを表示する（注釈は含めない） */
export const PreviewDialog = ({
  reply,
  paragraphs,
  remaining = 0,
  gaps = 0,
  onClose,
}: {
  reply: { to: string; subject: string; opening?: string; closing?: string };
  /** 段落ごとの送る文面 */
  paragraphs: string[];
  /** 送る前にやることのうち、まだチェックしていない件数 */
  remaining?: number;
  /** 書き起こしが必要な空欄の数（下線ごとの画面） */
  gaps?: number;
  onClose: () => void;
}) => {
  const body = [reply.opening, ...paragraphs, reply.closing].filter(Boolean);

  const [copy, setCopy] = useState<CopyState>("idle");
  useEffect(() => {
    if (copy === "idle") {
      return;
    }
    const timer = setTimeout(() => setCopy("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copy]);
  // 段落の間は空行にして、メールにそのまま貼れる形でコピーする
  const copyBody = () =>
    navigator.clipboard.writeText(body.join("\n\n")).then(
      () => setCopy("copied"),
      () => setCopy("failed"),
    );

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2 id="preview-title">返信プレビュー</h2>
          <div className="dialog-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={COPY_LABEL[copy]}
              title={COPY_LABEL[copy]}
              onClick={copyBody}
            >
              <Icon name={copy === "copied" ? "check" : copy === "failed" ? "x" : "copy"} />
            </button>
            <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>
        </div>
        {/* コピーは止めない（送った後にフォローする前提で送ることもある）が、残っていることは見落とさないよう目立たせる */}
        {remaining > 0 && (
          <p className="dialog-warning" role="alert">
            <Icon name="shield" size={14} />
            送る前にやることが残り {remaining} 件あります。確かめてからコピーしてください。
          </p>
        )}
        {gaps > 0 && (
          <p className="dialog-warning" role="alert">
            <Icon name="shield" size={14} />
            要記入の空欄が {gaps} 件あります。「［要記入：…］」を書き起こしてから送ってください。
          </p>
        )}
        <p className="muted small">
          宛先: {reply.to} ・ 件名: {reply.subject}
        </p>
        <div className="dialog-body">
          {body.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
        </div>
        <p className="muted small">この画面からは送信されません。</p>
      </div>
    </div>
  );
};
