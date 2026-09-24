import type { ReactNode } from "react";
import "./Badge.css";

type Tone = "neutral" | "good" | "bad" | "warn";

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", dot = true, children, className }: BadgeProps) {
  return (
    <span className={["badge", `badge--${tone}`, className ?? ""].filter(Boolean).join(" ")}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
