import type { ReactNode } from "react";
import "./StatTile.css";

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Small note under the value, e.g. "of 32 GB". */
  note?: ReactNode;
  onClick?: () => void;
}

export function StatTile({ label, value, note, onClick }: StatTileProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={["stat-tile", onClick ? "stat-tile--button" : ""].filter(Boolean).join(" ")} onClick={onClick} type={onClick ? "button" : undefined}>
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
      {note && <span className="stat-tile__note">{note}</span>}
    </Tag>
  );
}
