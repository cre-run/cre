import { useState } from "react";
import { formatMonthDayTime } from "../labels.ts";
import type { Inquiry } from "@cre/editor-payload";
import { Icon } from "./Icon.tsx";

export const InquiryCard = ({ inquiry }: { inquiry: Inquiry }) => {
  const [open, setOpen] = useState(false);
  const body = inquiry.paragraphs.map((p) => p.text).join(" ");
  return (
    <section className="card inquiry" aria-label="お客様からのメッセージ">
      <span className="avatar" aria-hidden="true">
        {inquiry.from.slice(0, 1)}
      </span>
      <div className="inquiry-body">
        <p className="inquiry-from">
          <strong>{inquiry.from}</strong>
          <span>からのメッセージ</span>
        </p>
        {open ? (
          <div className="inquiry-full">
            {inquiry.paragraphs.map((p) => (
              <p key={p.id}>{p.text}</p>
            ))}
          </div>
        ) : (
          <p className="inquiry-preview">{body}</p>
        )}
      </div>
      <div className="inquiry-side">
        <time dateTime={inquiry.receivedAt}>{formatMonthDayTime(inquiry.receivedAt)}</time>
        <button type="button" className="link-button" onClick={() => setOpen(!open)}>
          元のメール <Icon name="chevronDown" size={12} />
        </button>
      </div>
    </section>
  );
};
