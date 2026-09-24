import { useState } from "react";
import type { AppErrorShape } from "@/types";
import { AlertTriangleIcon } from "@/components/icons";
import "./ErrorNotice.css";

/**
 * The one place a backend failure is shown to the user: a plain message,
 * why it happened and what to do about it when the backend supplied those,
 * and a "View Details" disclosure for the raw technical text - never a raw
 * stack trace up front. Mirrors `src-tauri/src/error.rs`'s `AppError` shape.
 */
export function ErrorNotice({ error }: { error: AppErrorShape }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="error-notice">
      <AlertTriangleIcon size={17} className="error-notice__icon" />
      <div className="error-notice__body">
        <p className="error-notice__message">{error.message}</p>
        {error.reason && (
          <p className="error-notice__line">
            <span className="error-notice__label">Reason:</span> {error.reason}
          </p>
        )}
        {error.suggestedFix && (
          <p className="error-notice__line">
            <span className="error-notice__label">Suggested fix:</span> {error.suggestedFix}
          </p>
        )}
        {error.technical && (
          <>
            <button type="button" className="error-notice__toggle" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? "Hide details" : "View Details"}
            </button>
            {showDetails && <pre className="error-notice__technical mono selectable">{error.technical}</pre>}
          </>
        )}
      </div>
    </div>
  );
}
