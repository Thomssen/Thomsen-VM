import type { ReactNode } from "react";
import "./Page.css";

interface PageProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Page({ title, eyebrow, description, actions, children }: PageProps) {
  return (
    <div className="page">
      <div className="page__scroll">
        <div className="page__inner">
          <header className="page__header">
            <div className="page__heading">
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              <h1 className="page__title">{title}</h1>
              {description && <p className="page__description">{description}</p>}
            </div>
            {actions && <div className="page__actions">{actions}</div>}
          </header>

          {children}
        </div>
      </div>
    </div>
  );
}

/** A titled block within a page body. */
export function Section({ title, description, actions, children }: { title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="page-section">
      {(title || actions) && (
        <div className="page-section__head">
          <div>
            {title && <h2 className="page-section__title">{title}</h2>}
            {description && <p className="page-section__description">{description}</p>}
          </div>
          {actions && <div className="page-section__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
