/** Theme resolution shared by the pre-paint bootstrap and SettingsProvider. */

import type { ThemeSetting } from "@/types";

export const THEME_CACHE_KEY = "tvm-theme";

export function resolveTheme(setting: ThemeSetting): "dark" | "light" {
  if (setting === "system") {
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return setting;
}

export function applyTheme(setting: ThemeSetting): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, setting);
  } catch {
    /* ignore */
  }
  const root = document.documentElement;
  root.classList.add("theme-transition");
  window.setTimeout(() => root.classList.remove("theme-transition"), 320);
  root.setAttribute("data-theme", resolveTheme(setting));
}

/** Call when the setting is "system" to follow OS changes; returns cleanup. */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
