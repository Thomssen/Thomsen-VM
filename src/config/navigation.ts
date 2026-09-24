/**
 * Sidebar navigation. Text only - no icons - to keep the rail quiet, same
 * convention as every other Thomsen app.
 *
 * Add a page: add a `Route`, an entry in `NAV_GROUPS` here, and a case in
 * <RouteView> (src/app/RouteView.tsx).
 */

export type Route = "dashboard" | "vms" | "create-vm" | "snapshots" | "system" | "settings" | "vm-details";

export interface NavItem {
  route: Route;
  label: string;
}

/** Primary nav. Settings is pinned separately at the rail's foot. */
export const NAV_GROUPS: readonly (readonly NavItem[])[] = [
  [
    { route: "dashboard", label: "Dashboard" },
    { route: "vms", label: "Virtual Machines" },
    { route: "create-vm", label: "Create VM" },
    { route: "snapshots", label: "Snapshots" },
  ],
  [{ route: "system", label: "System" }],
] as const;

export const SETTINGS_ITEM: NavItem = { route: "settings", label: "Settings" };

/** Reached only by navigating directly (clicking a VM card), never from the
 * sidebar - still needs a label so the title bar doesn't render blank. */
const HIDDEN_ROUTES: readonly NavItem[] = [{ route: "vm-details", label: "Virtual Machine" }];

export const ROUTE_LABELS: Record<Route, string> = Object.fromEntries(
  [...NAV_GROUPS.flat(), SETTINGS_ITEM, ...HIDDEN_ROUTES].map((i) => [i.route, i.label]),
) as Record<Route, string>;

export const DEFAULT_ROUTE: Route = "dashboard";
