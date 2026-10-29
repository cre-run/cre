import { remainingBeforeSend, type ActionGroups, type ActionItem } from "../actions.ts";
import { STATUS } from "../labels.ts";
import { Icon } from "./Icon.tsx";

const Item = ({
  item,
  done,
  onToggle,
  onSelect,
}: {
  item: ActionItem;
  done: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) => (
  <li className={`action ${done ? "is-done" : ""}`}>
    <input
      type="checkbox"
      checked={done}
      onChange={onToggle}
      aria-label={`${item.topic} を確認済みにする`}
    />
    <div className="action-body">
      <p className="action-title">
        <span className={`status-label status-${item.status}`}>
          <span aria-hidden="true">{STATUS[item.status].icon}</span> {STATUS[item.status].label}
        </span>
        {item.topic}
        <span className="muted small">（段落{item.index}）</span>
      </p>
      <p className="action-text">{item.action}</p>
      {item.owners.length > 0 && (
        <p className="muted small action-owners">
          <Icon name="users" size={12} />
          {item.owners.join("・")}
        </p>
      )}
    </div>
    <button type="button" className="link-button" onClick={onSelect}>
      箇所を見る <Icon name="arrowRight" size={12} />
    </button>
  </li>
);

/** 「7 箇所のうち 4 箇所確認済み」の代わりに、取るべきアクションを具体的に並べる */
export const ActionList = ({
  groups,
  done,
  onToggle,
  onSelect,
}: {
  groups: ActionGroups;
  done: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) => {
  const { beforeSend, afterSend } = groups;
  const remaining = remainingBeforeSend(groups, done);

  if (beforeSend.length === 0 && afterSend.length === 0) {
    return (
      <div className="actions">
        <p className="actions-clear">
          <Icon name="check" size={14} />
          追加で確認することはありません。このまま送れます。
        </p>
      </div>
    );
  }

  const render = (items: ActionItem[]) => (
    <ul className="action-list">
      {items.map((item) => (
        <Item
          key={item.id}
          item={item}
          done={done.has(item.id)}
          onToggle={() => onToggle(item.id)}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </ul>
  );

  return (
    <div className="actions" id="actions" aria-label="改善アクション">
      <div className="actions-head">
        <h3>
          <Icon name="shield" size={14} />
          送る前にやること（{beforeSend.length}件）
        </h3>
        <span className="muted small">
          {beforeSend.length === 0
            ? "送る前に確認することはありません"
            : remaining === 0
              ? "すべて確認しました。このまま送れます"
              : `あと${remaining}件確認すると送れます`}
        </span>
      </div>
      {beforeSend.length > 0 && render(beforeSend)}

      {afterSend.length > 0 && (
        <>
          <div className="actions-head">
            <h3>
              <Icon name="clock" size={14} />
              送った後のフォロー（{afterSend.length}件）
            </h3>
            <span className="muted small">
              {afterSend.every((item) => item.status === "conditional")
                ? "お客様の回答を受けて対応します"
                : "送った後に対応します"}
            </span>
          </div>
          {render(afterSend)}
        </>
      )}
    </div>
  );
};
