import type { Reply } from "@cre/editor-payload";
import { Icon } from "./Icon.tsx";

/** お客様に送る文面だけを表示する（注釈は含めない） */
export const PreviewDialog = ({
  reply,
  texts,
  onClose,
}: {
  reply: Reply;
  texts: Record<string, string>;
  onClose: () => void;
}) => {
  const body = [
    reply.opening,
    ...reply.paragraphs.map((p) => texts[p.id] ?? p.text),
    reply.closing,
  ].filter(Boolean);
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
          <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
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
