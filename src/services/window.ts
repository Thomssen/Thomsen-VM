/**
 * Custom frameless window controls. Wraps `@tauri-apps/api/window`; every call
 * is a safe no-op outside Tauri so the title bar still renders in a browser.
 */

import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { isTauri } from "./ipc";

type MaybeWindow = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  unmaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  isMinimized: () => Promise<boolean>;
  outerPosition: () => Promise<{ x: number; y: number }>;
  outerSize: () => Promise<{ width: number; height: number }>;
  onResized: (cb: () => void) => Promise<() => void>;
  onMoved: (cb: () => void) => Promise<() => void>;
  setFullscreen: (fullscreen: boolean) => Promise<void>;
  isFullscreen: () => Promise<boolean>;
  setPosition: (position: InstanceType<typeof PhysicalPosition>) => Promise<void>;
  setSize: (size: InstanceType<typeof PhysicalSize>) => Promise<void>;
};

let cached: MaybeWindow | null = null;

async function appWindow(): Promise<MaybeWindow | null> {
  if (!isTauri()) return null;
  if (cached) return cached;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  cached = getCurrentWindow() as unknown as MaybeWindow;
  return cached;
}

export async function minimizeWindow(): Promise<void> {
  (await appWindow())?.minimize();
}
export async function toggleMaximizeWindow(): Promise<void> {
  (await appWindow())?.toggleMaximize();
}
export async function closeWindow(): Promise<void> {
  (await appWindow())?.close();
}
export async function isWindowMaximized(): Promise<boolean> {
  return (await appWindow())?.isMaximized() ?? false;
}
export async function onMaximizeChange(cb: (maximized: boolean) => void): Promise<() => void> {
  const win = await appWindow();
  if (!win) return () => {};
  return win.onResized(async () => cb(await win.isMaximized()));
}

/** Current outer position/size/maximized state, for "remember window
 * position" - `null` outside Tauri, and also `null` while minimized: Windows
 * reports a minimized window's geometry as a tiny off-screen rectangle
 * (historically position -32000,-32000), which must never be saved as the
 * "restore to this" position or the next launch would open unusably small
 * and off-screen. */
export async function currentGeometry(): Promise<{ x: number; y: number; width: number; height: number; maximized: boolean } | null> {
  const win = await appWindow();
  if (!win) return null;
  if (await win.isMinimized()) return null;
  const [pos, size, maximized] = await Promise.all([win.outerPosition(), win.outerSize(), win.isMaximized()]);
  if (size.width < 300 || size.height < 200) return null;
  return { x: pos.x, y: pos.y, width: size.width, height: size.height, maximized };
}

/** Fires (debounced by the caller) on move or resize, for saving geometry. */
export async function onGeometryChange(cb: () => void): Promise<() => void> {
  const win = await appWindow();
  if (!win) return () => {};
  const unsubs = await Promise.all([win.onResized(cb), win.onMoved(cb)]);
  return () => unsubs.forEach((u) => u());
}

// ---------------------------------------------------------------------------
// Full screen + monitor placement (VM Console)
// ---------------------------------------------------------------------------

export async function setWindowFullscreen(fullscreen: boolean): Promise<void> {
  await (await appWindow())?.setFullscreen(fullscreen);
}
export async function isWindowFullscreen(): Promise<boolean> {
  return (await appWindow())?.isFullscreen() ?? false;
}
/** Clears the OS maximized state without resizing. Windows can end up
 * treating a fullscreen exit as a restore-from-maximize (see
 * `ConsoleWindow.exitFullscreen`); a plain `setSize`/`setPosition` is
 * ignored while that flag is still set, so it must be cleared first. */
export async function unmaximizeWindow(): Promise<void> {
  await (await appWindow())?.unmaximize();
}

/** A real connected display, as reported by Windows - never hardcoded. */
export interface MonitorInfo {
  /** Windows' adapter device name (e.g. `\\.\DISPLAY1`); `null` if the OS
   * didn't report one. Used as the stable key for `settings.vmMonitor`. */
  name: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
}

type RawMonitor = { name: string | null; position: { x: number; y: number }; size: { width: number; height: number }; scaleFactor: number };

function sameMonitor(a: RawMonitor, b: RawMonitor): boolean {
  return a.name && b.name ? a.name === b.name : a.position.x === b.position.x && a.position.y === b.position.y;
}

function toMonitorInfo(m: RawMonitor, isPrimary: boolean): MonitorInfo {
  return { name: m.name, x: m.position.x, y: m.position.y, width: m.size.width, height: m.size.height, scaleFactor: m.scaleFactor, isPrimary };
}

/** Every physical monitor currently connected - powers the Settings -> Display
 * "VM Monitor" picker and full-screen placement. Empty outside Tauri. */
export async function listMonitors(): Promise<MonitorInfo[]> {
  if (!isTauri()) return [];
  const { availableMonitors, primaryMonitor } = await import("@tauri-apps/api/window");
  const [monitors, primary] = await Promise.all([availableMonitors(), primaryMonitor()]);
  return monitors.map((m) => toMonitorInfo(m, primary != null && sameMonitor(m, primary)));
}

/** The monitor the Console window is currently on - the full-screen target
 * when `settings.vmMonitor` isn't set to a specific one. */
export async function currentMonitorInfo(): Promise<MonitorInfo | null> {
  if (!isTauri()) return null;
  const { currentMonitor, primaryMonitor } = await import("@tauri-apps/api/window");
  const [m, primary] = await Promise.all([currentMonitor(), primaryMonitor()]);
  return m ? toMonitorInfo(m, primary != null && sameMonitor(m, primary)) : null;
}

/** Moves and resizes the window to an exact rectangle in physical pixels -
 * used both to cover the chosen monitor before entering full screen, and to
 * restore the pre-fullscreen window bounds on exit. */
export async function setWindowBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void> {
  const win = await appWindow();
  if (!win) return;
  const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
  await win.setPosition(new PhysicalPosition(Math.round(bounds.x), Math.round(bounds.y)));
  await win.setSize(new PhysicalSize(Math.round(bounds.width), Math.round(bounds.height)));
}
