/**
 * Window-level file drag-and-drop. Tauri intercepts OS drag-drop at the
 * webview level (so it can hand back real filesystem paths instead of a
 * browser File blob), which means the usual HTML5 `ondrop` event never
 * fires - this listens on the Tauri-specific event instead. No-op outside
 * Tauri, matching every other service in this module.
 */

import { isTauri } from "./ipc";

export async function watchFileDrop(onDrop: (paths: string[]) => void, onHover: (hovering: boolean) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") {
      onHover(false);
      onDrop(event.payload.paths);
    } else if (event.payload.type === "over") {
      onHover(true);
    } else {
      onHover(false);
    }
  });
  return unlisten;
}
