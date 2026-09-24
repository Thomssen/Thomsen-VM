/**
 * Native file dialogs and "open in OS" helpers. Thin wrappers over the Tauri
 * dialog / opener plugins that degrade to no-ops outside Tauri.
 */

import { isTauri } from "./ipc";

export interface OpenOptions {
  title?: string;
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
}

export async function openDialog(opts: OpenOptions): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ ...opts, multiple: false });
  return typeof picked === "string" ? picked : null;
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri()) return;
  const { openPath: op } = await import("@tauri-apps/plugin-opener");
  await op(path);
}

export async function revealPath(path: string): Promise<void> {
  if (!isTauri()) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}
