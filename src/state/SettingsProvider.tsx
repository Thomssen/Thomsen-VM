import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Settings } from "@/types";
import { getSettings, saveSettings } from "@/services/settings";
import { applyTheme, watchSystemTheme } from "./theme";

const FALLBACK: Settings = {
  username: "",
  theme: "dark",
  windowStyle: "macos",
  onboardingCompleted: false,
  requireLoginOnStartup: true,
  startWithWindows: false,
  rememberWindowPosition: true,
  checkForUpdates: true,
  confirmBeforeDeleteVms: true,
  defaultVmFolder: null,
  defaultCpuCores: 2,
  defaultRamMb: 2048,
  defaultDiskGb: 40,
  defaultNetworkMode: "nat",
  windowGeometry: null,
  vmMonitor: null,
  scalingMode: "fit",
  keepAspectRatio: true,
  autoResizeGuest: true,
  rememberFullscreen: true,
  lastFullscreen: false,
};

interface SettingsContextValue {
  settings: Settings;
  loading: boolean;
  /** Persist a partial change and update local state with the server's copy. */
  update: (patch: Partial<Settings>) => Promise<Settings>;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const stopWatch = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    try {
      const s = await getSettings();
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Keep <html data-theme> in step with the setting, following the OS when
  // the setting is "system".
  useEffect(() => {
    applyTheme(settings.theme);
    stopWatch.current();
    if (settings.theme === "system") {
      stopWatch.current = watchSystemTheme(() => applyTheme("system"));
    } else {
      stopWatch.current = () => {};
    }
    return () => stopWatch.current();
  }, [settings.theme]);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const next = await saveSettings({ ...settings, ...patch });
      setSettings(next);
      return next;
    },
    [settings],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loading, update, reload }),
    [settings, loading, update, reload],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}
