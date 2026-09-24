import { APP } from "@/config/app";
import { NAV_GROUPS, SETTINGS_ITEM, type Route } from "@/config/navigation";
import { useNavigation } from "@/state/NavigationProvider";
import { useLock } from "@/state/LockProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LockIcon } from "@/components/icons";
import "./Sidebar.css";

export function Sidebar() {
  const { route, navigate } = useNavigation();
  const { hasPassword, lock } = useLock();

  // Viewing a VM's details page still reads as "inside Virtual Machines" -
  // it's a drill-down from that list, not a separate section.
  const isActive = (r: Route) => route === r || (r === "vms" && route === "vm-details");
  const linkClass = (r: Route) => ["sidebar__link", isActive(r) ? "is-active" : ""].filter(Boolean).join(" ");

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__mark" aria-hidden="true">
          T
        </span>
        <span className="sidebar__wordmark">{APP.brand}</span>
      </div>

      <nav className="sidebar__nav" aria-label="Primary">
        {NAV_GROUPS.map((group, gi) => (
          <div className="sidebar__group" key={gi}>
            {group.map((item) => (
              <button key={item.route} type="button" className={linkClass(item.route)} aria-current={isActive(item.route) ? "page" : undefined} onClick={() => navigate(item.route)}>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button type="button" className={linkClass(SETTINGS_ITEM.route)} aria-current={isActive(SETTINGS_ITEM.route) ? "page" : undefined} onClick={() => navigate(SETTINGS_ITEM.route)}>
          {SETTINGS_ITEM.label}
        </button>
        <div className="sidebar__footer-right">
          <Badge tone="good" dot={false}>
            Free
          </Badge>
          {hasPassword && (
            <Button variant="ghost" size="sm" icon={<LockIcon size={14} />} title="Lock" aria-label="Lock" onClick={lock} />
          )}
        </div>
      </div>
    </aside>
  );
}
