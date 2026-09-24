import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  changePassword as changePasswordBackend,
  createPassword as createPasswordBackend,
  disablePassword as disablePasswordBackend,
  hasPassword as fetchHasPassword,
  verifyPassword,
} from "@/services/security";
import { useSettings } from "@/state/SettingsProvider";
import type { UnlockResult } from "@/types";

interface LockContextValue {
  loading: boolean;
  hasPassword: boolean;
  locked: boolean;
  unlock: (password: string) => Promise<UnlockResult>;
  /** Re-lock a running session (Lock/Logout). No-op without a password set -
   * there would be no way back in. Never touches settings, VMs, or any other
   * stored config - purely in-memory UI state, so a running VM keeps
   * running untouched while the lock screen is shown. */
  lock: () => void;
  createPassword: (password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  disablePassword: (current: string) => Promise<void>;
}

const LockContext = createContext<LockContextValue | null>(null);

/** Gates the app behind a password screen on launch (governed by
 * `settings.requireLoginOnStartup`) and whenever `lock()` is called - see
 * `App.tsx`. Deliberately just launch-time/manual, not idle-timeout based:
 * nothing in the spec asked for an idle re-lock behavior. */
export function LockProvider({ children }: { children: ReactNode }) {
  const { settings, loading: settingsLoading } = useSettings();
  const [loading, setLoading] = useState(true);
  const [hasPasswordState, setHasPasswordState] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    // Wait for settings to resolve first so the startup lock decision below
    // can see the real `requireLoginOnStartup` value instead of the
    // fallback default on the very first render.
    if (settingsLoading) return;
    void fetchHasPassword()
      .then((v) => {
        setHasPasswordState(v);
        // Fresh launch: start locked only if protection is on AND the user
        // hasn't opted out of the startup prompt via Settings.
        setLocked(v && settings.requireLoginOnStartup);
      })
      .finally(() => setLoading(false));
    // Intentionally only re-runs when settingsLoading flips from true to
    // false (app launch) - `settings.requireLoginOnStartup` changing later
    // while already unlocked must not retroactively lock the running app.
  }, [settingsLoading]);

  const unlock = useCallback(async (password: string): Promise<UnlockResult> => {
    const result = await verifyPassword(password);
    if (result.ok) setLocked(false);
    return result;
  }, []);

  const lock = useCallback(() => {
    if (hasPasswordState) setLocked(true);
  }, [hasPasswordState]);

  const createPassword = useCallback(async (password: string) => {
    await createPasswordBackend(password);
    setHasPasswordState(true);
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    await changePasswordBackend(current, next);
  }, []);

  const disablePassword = useCallback(async (current: string) => {
    await disablePasswordBackend(current);
    setHasPasswordState(false);
  }, []);

  const value: LockContextValue = {
    loading,
    hasPassword: hasPasswordState,
    locked,
    unlock,
    lock,
    createPassword,
    changePassword,
    disablePassword,
  };

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock(): LockContextValue {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used within <LockProvider>");
  return ctx;
}
