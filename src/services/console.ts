/**
 * The VM Console opens as its own frameless Tauri window (not a page inside
 * the main app), same SPA bundle pointed at a `#console/<id>` hash route
 * (see main.tsx). Re-opening a console that's already open just focuses it.
 */

import { isTauri } from "./ipc";

export async function openVmConsole(vmId: string, vmName: string): Promise<void> {
  if (!isTauri()) return;

  const { WebviewWindow, getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
  const label = `console-${vmId}`;

  const all = await getAllWebviewWindows();
  const existing = all.find((w) => w.label === label);
  if (existing) {
    await existing.setFocus();
    return;
  }

  new WebviewWindow(label, {
    url: `index.html#console/${encodeURIComponent(vmId)}`,
    title: `${vmName} — Console`,
    width: 980,
    height: 660,
    minWidth: 640,
    minHeight: 420,
    decorations: false,
    center: true,
  });
}
