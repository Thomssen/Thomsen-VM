import type { WindowStyle } from "@/types";
import { MinimizeIcon, MaximizeIcon, RestoreIcon, CloseIcon } from "@/components/icons";
import "./TitleBar.css";

interface WindowControlsProps {
  style: WindowStyle;
  maximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  /** Label/tooltip for the maximize/green button when not maximized -
   * defaults to "Maximize". A window that repurposes the green button (the
   * VM Console's full-screen toggle) passes something like "Enter Full
   * Screen" so it reads correctly instead of implying an OS-level maximize. */
  maximizeLabel?: string;
}

/**
 * The macOS traffic-light / Windows rectangular-cluster window controls,
 * shared by every custom-titlebar window in the app (the main window's
 * `TitleBar`, the VM Console's header) so `settings.windowStyle` is always
 * respected consistently, not just on the main window.
 */
export function WindowControls({ style, maximized, onClose, onMinimize, onMaximize, maximizeLabel }: WindowControlsProps) {
  return style === "windows" ? (
    <WindowsControls maximized={maximized} onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} maximizeLabel={maximizeLabel} />
  ) : (
    <MacosControls maximized={maximized} onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} maximizeLabel={maximizeLabel} />
  );
}

function MacosControls({ maximized, onClose, onMinimize, onMaximize, maximizeLabel = "Maximize" }: Omit<WindowControlsProps, "style">) {
  return (
    <div className="titlebar__controls titlebar__controls--macos">
      <button type="button" className="titlebar__btn titlebar__btn--close" aria-label="Close" onClick={onClose}>
        <CloseIcon size={8} />
      </button>
      <button type="button" className="titlebar__btn titlebar__btn--minimize" aria-label="Minimize" onClick={onMinimize}>
        <MinimizeIcon size={8} />
      </button>
      <button type="button" className="titlebar__btn titlebar__btn--maximize" aria-label={maximized ? "Restore" : maximizeLabel} onClick={onMaximize}>
        {maximized ? <RestoreIcon size={8} /> : <MaximizeIcon size={8} />}
      </button>
    </div>
  );
}

function WindowsControls({ maximized, onClose, onMinimize, onMaximize, maximizeLabel = "Maximize" }: Omit<WindowControlsProps, "style">) {
  return (
    <div className="titlebar__controls titlebar__controls--windows">
      <button type="button" className="titlebar__winbtn" aria-label="Minimize" onClick={onMinimize}>
        <MinimizeIcon size={10} />
      </button>
      <button type="button" className="titlebar__winbtn" aria-label={maximized ? "Restore" : maximizeLabel} onClick={onMaximize}>
        {maximized ? <RestoreIcon size={10} /> : <MaximizeIcon size={10} />}
      </button>
      <button type="button" className="titlebar__winbtn titlebar__winbtn--close" aria-label="Close" onClick={onClose}>
        <CloseIcon size={10} />
      </button>
    </div>
  );
}
