import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes inner padding so the card can host a table / list flush. */
  flush?: boolean;
  /** Subtle hover lift, for cards that are clickable. */
  interactive?: boolean;
}

export function Card({ flush, interactive, className, children, ...rest }: CardProps) {
  return (
    <div
      className={["card", flush ? "card--flush" : "", interactive ? "card--interactive" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({ title, description, actions }: CardHeaderProps) {
  return (
    <div className="card__header">
      <div className="card__heading">
        <h3 className="card__title">{title}</h3>
        {description && <p className="card__description">{description}</p>}
      </div>
      {actions && <div className="card__actions">{actions}</div>}
    </div>
  );
}
