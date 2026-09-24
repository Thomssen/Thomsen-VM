import { useEffect, useState } from "react";
import { APP } from "@/config/app";
import { ROUTE_LABELS } from "@/config/navigation";
import { useNavigation } from "@/state/NavigationProvider";
import { useSettings } from "@/state/SettingsProvider";
import { WindowControls } from "./WindowControls";
import { closeWindow, isWindowMaximized, minimizeWindow, onMaximizeChange, toggleMaximizeWindow } from "@/services/window";
import "./TitleBar.css";

/**
 * Custom frameless title bar, same mechanism as Thomsen OSINT: the whole bar
 * is a drag region; the controls opt out. The button style (macOS traffic
 * lights vs Windows rectangular cluster) is chosen in first-run setup /
 * Settings and stored in `settings.windowStyle` - see `WindowControls`,
 * shared with the VM Console window so both respect it.
 */
export function TitleBar() {
  const { route } = useNavigation();
  const { settings } = useSettings();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void isWindowMaximized().then(setMaximized);
    const unsub = onMaximizeChange(setMaximized);
    return () => {
      void unsub.then((fn) => fn());
    };
  }, []);

  return (
    <div className={["titlebar", settings.windowStyle === "windows" ? "titlebar--windows" : ""].filter(Boolean).join(" ")} data-tauri-drag-region onDoubleClick={toggleMaximizeWindow}>
      <div className="titlebar__label" data-tauri-drag-region>
        {APP.name}
        <span className="titlebar__sep">/</span>
        <span className="titlebar__route">{ROUTE_LABELS[route]}</span>
      </div>

      <WindowControls style={settings.windowStyle} maximized={maximized} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={toggleMaximizeWindow} />
    </div>
  );
}
