import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  resetKey?: unknown;
}
interface State {
  error: Error | null;
}

/** Catches a render-time crash in one page so the rest of the shell (sidebar,
 * title bar) stays usable, and resets automatically when `resetKey` changes
 * (i.e. navigating to another page). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: "var(--text-secondary)" }}>
          <p style={{ color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>Something went wrong on this page.</p>
          <p className="mono selectable" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
