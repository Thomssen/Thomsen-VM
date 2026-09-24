import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource-variable/inter";
import "@/styles/tokens.css";
import "@/styles/base.css";

import App from "@/App";
import { ConsoleWindow } from "@/pages/console/ConsoleWindow";
import { SettingsProvider } from "@/state/SettingsProvider";
import { LockProvider } from "@/state/LockProvider";
import { NavigationProvider } from "@/state/NavigationProvider";
import { ToastProvider } from "@/components/ui/Toast";

// A VM Console opens as its own Tauri window pointing at
// `index.html#console/<vmId>` (see services/console.ts) - same SPA bundle,
// a different root component, no sidebar/titlebar chrome to manage there.
const consoleMatch = window.location.hash.match(/^#console\/(.+)$/);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {consoleMatch ? (
      <SettingsProvider>
        <ToastProvider>
          <ConsoleWindow vmId={decodeURIComponent(consoleMatch[1] ?? "")} />
        </ToastProvider>
      </SettingsProvider>
    ) : (
      <SettingsProvider>
        <LockProvider>
          <ToastProvider>
            <NavigationProvider>
              <App />
            </NavigationProvider>
          </ToastProvider>
        </LockProvider>
      </SettingsProvider>
    )}
  </React.StrictMode>,
);
