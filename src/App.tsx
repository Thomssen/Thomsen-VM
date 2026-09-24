import { useEffect, useRef, useState } from "react";
import { TitleBar } from "@/components/TitleBar/TitleBar";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { RouteView } from "@/app/RouteView";
import { OnboardingWizard } from "@/pages/onboarding/OnboardingWizard";
import { LockScreen } from "@/pages/lock/LockScreen";
import { useSettings } from "@/state/SettingsProvider";
import { useLock } from "@/state/LockProvider";
import { getAppInfo } from "@/services/system";
import { currentGeometry, onGeometryChange } from "@/services/window";
import { saveWindowGeometry } from "@/services/settings";
import "@/styles/app.css";

/**
 * The frameless window shell: title bar on top, sidebar + content below - or,
 * before first-run setup has been completed (or after "Run Setup Again"),
 * the setup wizard in its place - all still under the same title bar so
 * window controls keep working everywhere.
 */
export default function App() {
  const { settings, loading: settingsLoading } = useSettings();
  const { locked, loading: lockLoading } = useLock();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void getAppInfo()
      .then((info) => setWarnings(info.loadWarnings))
      .catch(() => {});
  }, []);

  // Debounced geometry save for "Remember window position" - only actually
  // applied on next launch when that setting is on (see src-tauri lib.rs).
  const geometryTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!settings.rememberWindowPosition) return;
    let unsub = () => {};
    void onGeometryChange(() => {
      if (geometryTimer.current) window.clearTimeout(geometryTimer.current);
      geometryTimer.current = window.setTimeout(() => {
        void currentGeometry().then((g) => g && saveWindowGeometry(g).catch(() => {}));
      }, 500);
    }).then((fn) => {
      unsub = fn;
    });
    return () => unsub();
  }, [settings.rememberWindowPosition]);

  // Neither settings (including onboardingCompleted) nor the lock state have
  // resolved from disk yet - render just the shell rather than flashing the
  // wizard, the lock screen, or the main app based on a fallback default.
  if (settingsLoading || lockLoading) {
    return (
      <div className="app">
        <TitleBar />
        <div className="app__body" />
      </div>
    );
  }

  if (!settings.onboardingCompleted) {
    return (
      <div className="app">
        <TitleBar />
        <OnboardingWizard />
      </div>
    );
  }

  // Checked after onboarding, not before: a password created mid-wizard
  // must not lock the user out of the rest of the wizard they're already in.
  if (locked) {
    return (
      <div className="app">
        <TitleBar />
        <LockScreen />
      </div>
    );
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="app__body">
        <Sidebar />
        <main className="app__main">
          {warnings.length > 0 && !dismissed && (
            <div className="app__notice" role="status">
              <span>Some stored data could not be read: {warnings.join("; ")}. The rest loaded normally.</span>
              <button type="button" onClick={() => setDismissed(true)}>
                Dismiss
              </button>
            </div>
          )}
          <RouteView />
        </main>
      </div>
    </div>
  );
}
