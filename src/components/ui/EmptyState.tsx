import type { ReactNode } from "react";
import "./EmptyState.css";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Compact variant for use inside a card. */
  inset?: boolean;
}

export function EmptyState({ title, description, action, inset }: EmptyStateProps) {
  return (
    <div className={["empty", inset ? "empty--inset" : ""].filter(Boolean).join(" ")}>
      <p className="empty__title">{title}</p>
      {description && <p className="empty__description">{description}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
