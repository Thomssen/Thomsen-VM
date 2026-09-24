import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Modal";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Field } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import {
  CpuIcon,
  DiskIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  KeyboardIcon,
  MemoryIcon,
  MonitorIcon,
  NetworkIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  RestartIcon,
  StopIcon,
} from "@/components/icons";
import { VmDisplay } from "@/components/vm/VmDisplay";
import { WindowControls } from "@/components/TitleBar/WindowControls";
import { getVm, getVmLiveStats, pauseVm, resumeVm, restartVm, sendCtrlAltDel, startVm, stopVm } from "@/services/vms";
import {
  closeWindow,
  currentGeometry,
  currentMonitorInfo,
  isWindowFullscreen,
  listMonitors,
  minimizeWindow,
  setWindowBounds,
  setWindowFullscreen,
  unmaximizeWindow,
} from "@/services/window";
import { asAppError, errorMessage } from "@/services/ipc";
import { capitalize, formatMb, formatPercent } from "@/lib/format";
import { useSettings } from "@/state/SettingsProvider";
import { SCALING_MODES } from "@/config/presets";
import type { AppErrorShape, ScalingMode, VmLiveStats, VmSummary, WindowStyle } from "@/types";
import "./ConsoleWindow.css";

const POLL_MS = 2000;
const ESC_HINT_MS = 2800;
const TOOLBAR_HIDE_MS = 2200;
const TOOLBAR_REVEAL_ZONE_PX = 64;
/** How long to let Windows' own window-manager bookkeeping (monitor
 * association on move, remembered pre-fullscreen size on exit) catch up
 * before/after a fullscreen transition - see `enterFullscreen`/
 * `exitFullscreen`. Short enough to be imperceptible as a delay. */
const SETTLE_MS = 120;
const settle = () => new Promise<void>((resolve) => window.setTimeout(resolve, SETTLE_MS));

const SCALING_MODE_OPTIONS: { value: ScalingMode; label: string }[] = SCALING_MODES.map((m) => ({ value: m.id, label: m.label }));

export function ConsoleWindow({ vmId }: { vmId: string }) {
  const toast = useToast();
  const { settings, update } = useSettings();
  const [vm, setVm] = useState<VmSummary | null>(null);
  const [stats, setStats] = useState<VmLiveStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorShape | null>(null);
  const [confirmForceStop, setConfirmForceStop] = useState(false);

  const [fullscreen, setFullscreenState] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [showEscHint, setShowEscHint] = useState(false);

  const prevBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const escHintTimer = useRef<number>();
  const toolbarHideTimer = useRef<number>();
  const restoredPreferenceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      void getVm(vmId)
        .then((v) => !cancelled && setVm(v))
        .catch(() => {});
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [vmId]);

  useEffect(() => {
    if (vm?.status !== "running") {
      setStats(null);
      return;
    }
    let cancelled = false;
    const tick = () =>
      void getVmLiveStats(vmId)
        .then((s) => !cancelled && setStats(s))
        .catch(() => {});
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [vmId, vm?.status]);

  // -- Full screen -----------------------------------------------------------

  const revealEscHint = useCallback(() => {
    setShowEscHint(true);
    window.clearTimeout(escHintTimer.current);
    escHintTimer.current = window.setTimeout(() => setShowEscHint(false), ESC_HINT_MS);
  }, []);

  const enterFullscreen = useCallback(async () => {
    const bounds = await currentGeometry();
    if (bounds) prevBoundsRef.current = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };

    let monitor = settings.vmMonitor ? (await listMonitors()).find((m) => m.name === settings.vmMonitor) ?? null : null;
    if (!monitor) monitor = await currentMonitorInfo();
    if (monitor && bounds) {
      // Only *reposition* onto the target monitor, keeping the window's
      // current size - deliberately never resize it to the monitor's full
      // dimensions here. Tauri's `setFullscreen(true)` below resolves "which
      // monitor" from the window's position alone, but pre-sizing it to
      // exactly cover a monitor makes Windows/tao treat that as a maximize,
      // which then corrupts the size fullscreen-exit restores to afterward
      // (see `exitFullscreen`) - the actual monitor-covering resize is left
      // to Tauri's own fullscreen transition, which tracks it correctly.
      const targetX = monitor.x + Math.max(0, Math.round((monitor.width - bounds.width) / 2));
      const targetY = monitor.y + Math.max(0, Math.round((monitor.height - bounds.height) / 2));
      await setWindowBounds({ x: targetX, y: targetY, width: bounds.width, height: bounds.height });
      // Windows can take a beat to actually settle the window's monitor
      // association after a move, so without this, fullscreen can be
      // requested before the OS has caught up and land on the wrong
      // (previous) monitor.
      await settle();
    }

    await setWindowFullscreen(true);
    setFullscreenState(true);
    setToolbarVisible(true);
    revealEscHint();
    if (settings.rememberFullscreen) update({ lastFullscreen: true }).catch(() => {});
  }, [settings.vmMonitor, settings.rememberFullscreen, update, revealEscHint]);

  const exitFullscreen = useCallback(async () => {
    await setWindowFullscreen(false);
    // Defense in depth against Windows having flagged the window maximized
    // at some point during the fullscreen transition: a plain setSize/
    // setPosition is silently ignored while that flag is set, so it must be
    // cleared before the explicit restore below can actually take effect.
    await unmaximizeWindow();
    const bounds = prevBoundsRef.current;
    if (bounds) {
      await setWindowBounds(bounds);
      // Windows can restore its own remembered pre-fullscreen size a moment
      // after `setWindowFullscreen(false)` resolves, silently overwriting
      // the correct bounds just set above. Re-asserting once more after
      // it's had time to fire makes this call the last (and therefore
      // winning) word.
      await settle();
      await setWindowBounds(bounds);
    }
    setFullscreenState(false);
    setShowEscHint(false);
    if (settings.rememberFullscreen) update({ lastFullscreen: false }).catch(() => {});
  }, [settings.rememberFullscreen, update]);

  const toggleFullscreen = useCallback(() => {
    (fullscreen ? exitFullscreen() : enterFullscreen()).catch((e) => toast.error(errorMessage(e)));
  }, [fullscreen, enterFullscreen, exitFullscreen, toast]);

  // Pick up the OS-reported fullscreen state once on mount (in case a future
  // code path ever opens the window already full screen), then separately -
  // once, after settings have actually loaded - restore the user's
  // remembered preference.
  useEffect(() => {
    void isWindowFullscreen().then(setFullscreenState);
  }, []);

  useEffect(() => {
    if (restoredPreferenceRef.current) return;
    if (!settings.rememberFullscreen || !settings.lastFullscreen) return;
    restoredPreferenceRef.current = true;
    enterFullscreen().catch(() => {});
  }, [settings.rememberFullscreen, settings.lastFullscreen, enterFullscreen]);

  // F11 toggles full screen (consumed, never reaches the guest). Escape is
  // never consumed - it always keeps going to the guest - but while full
  // screen it also surfaces the "how do I get out of this" hint.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
      } else if (e.key === "Escape" && fullscreen) {
        revealEscHint();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [fullscreen, toggleFullscreen, revealEscHint]);

  // Auto-hiding toolbar: reveal near the top edge or while it's hovered,
  // hide after a short idle period otherwise.
  useEffect(() => {
    if (!fullscreen) return;
    const scheduleHide = () => {
      window.clearTimeout(toolbarHideTimer.current);
      toolbarHideTimer.current = window.setTimeout(() => setToolbarVisible(false), TOOLBAR_HIDE_MS);
    };
    scheduleHide();

    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY <= TOOLBAR_REVEAL_ZONE_PX) {
        setToolbarVisible(true);
        window.clearTimeout(toolbarHideTimer.current);
      } else {
        scheduleHide();
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.clearTimeout(toolbarHideTimer.current);
    };
  }, [fullscreen]);

  useEffect(
    () => () => {
      window.clearTimeout(escHintTimer.current);
      window.clearTimeout(toolbarHideTimer.current);
    },
    [],
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(asAppError(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCad = () => void sendCtrlAltDel(vmId).catch((e) => toast.error(errorMessage(e)));

  const doForceStop = () => {
    setConfirmForceStop(false);
    void run(() => stopVm(vmId, true));
  };

  if (!vm) {
    return (
      <div className="console-window">
        <ConsoleHeader title="Loading…" windowStyle={settings.windowStyle} onEnterFullscreen={toggleFullscreen} />
      </div>
    );
  }

  const running = vm.status === "running";
  const paused = vm.status === "paused";
  const stopped = vm.status === "stopped";
  const showDisplay = running || paused;

  return (
    <div className={["console-window", fullscreen ? "console-window--fullscreen" : ""].filter(Boolean).join(" ")}>
      {!fullscreen && <ConsoleHeader title={vm.name} status={vm.status} windowStyle={settings.windowStyle} onEnterFullscreen={toggleFullscreen} />}

      <div className="console-window__body">
        <div className={["console-window__stage", showDisplay ? "console-window__stage--display" : ""].filter(Boolean).join(" ")}>
          {showDisplay ? (
            <VmDisplay vmId={vmId} scalingMode={settings.scalingMode} keepAspectRatio={settings.keepAspectRatio} autoResizeGuest={settings.autoResizeGuest} />
          ) : (
            <>
              <MonitorIcon size={40} className="console-window__stage-icon" />
              <p className="console-window__stage-status">Stopped</p>
              <p className="console-window__stage-note">Start this virtual machine to open its display.</p>
            </>
          )}
          {error && (
            <div className="console-window__error">
              <ErrorNotice error={error} />
            </div>
          )}
        </div>

        {!fullscreen && (
          <>
            <div className="console-window__indicators">
              <Indicator icon={<CpuIcon size={14} />} label="CPU" value={running ? formatPercent(stats?.cpuPercent) : "—"} />
              <Indicator icon={<MemoryIcon size={14} />} label="RAM" value={running ? formatMb(stats?.ramUsedMb) : "—"} />
              <Indicator icon={<DiskIcon size={14} />} label="Disk" value={running && stats?.diskWriteBytesPerSec != null ? `${Math.round((stats.diskWriteBytesPerSec + (stats.diskReadBytesPerSec ?? 0)) / 1024)} KB/s` : "—"} />
              <Indicator icon={<NetworkIcon size={14} />} label="Network" value={running ? (stats?.networkAvailable ? "Active" : "Unavailable") : "—"} />
            </div>

            <div className="console-window__controls">
              {stopped && (
                <ControlButton icon={<PlayIcon size={15} />} label="Start" primary busy={busy} onClick={() => run(() => startVm(vmId))} />
              )}
              {running && <ControlButton icon={<PauseIcon size={15} />} label="Pause" busy={busy} onClick={() => run(() => pauseVm(vmId))} />}
              {paused && <ControlButton icon={<PlayIcon size={15} />} label="Resume" primary busy={busy} onClick={() => run(() => resumeVm(vmId))} />}
              <ControlButton icon={<RestartIcon size={15} />} label="Restart" disabled={stopped} busy={busy} onClick={() => run(() => restartVm(vmId))} />
              <ControlButton icon={<PowerIcon size={15} />} label="Shutdown" disabled={stopped} busy={busy} onClick={() => run(() => stopVm(vmId))} />
              {/* For a guest not responding to the graceful ACPI shutdown
                  Shutdown sends (not yet booted, hung, or a live/installer
                  environment with no power-button handling) - terminates
                  the QEMU process directly. */}
              <ControlButton icon={<StopIcon size={14} />} label="Force Stop" danger disabled={stopped} busy={busy} onClick={() => setConfirmForceStop(true)} />
              <ControlButton icon={<KeyboardIcon size={15} />} label="Ctrl+Alt+Del" disabled={!running} onClick={sendCad} />
              <ControlButton icon={<FullscreenIcon size={15} />} label="Fullscreen" onClick={toggleFullscreen} />
            </div>
          </>
        )}
      </div>

      {fullscreen && (
        <FullscreenToolbar
          visible={toolbarVisible}
          vm={vm}
          busy={busy}
          onEnter={() => {
            setToolbarVisible(true);
            window.clearTimeout(toolbarHideTimer.current);
          }}
          onLeave={() => {
            toolbarHideTimer.current = window.setTimeout(() => setToolbarVisible(false), TOOLBAR_HIDE_MS);
          }}
          onPause={() => run(() => pauseVm(vmId))}
          onResume={() => run(() => resumeVm(vmId))}
          onRestart={() => run(() => restartVm(vmId))}
          onExit={toggleFullscreen}
          scalingMode={settings.scalingMode}
          keepAspectRatio={settings.keepAspectRatio}
          autoResizeGuest={settings.autoResizeGuest}
          onScalingModeChange={(scalingMode) => void update({ scalingMode })}
          onKeepAspectRatioChange={(v) => void update({ keepAspectRatio: v })}
          onAutoResizeGuestChange={(v) => void update({ autoResizeGuest: v })}
        />
      )}

      {fullscreen && showEscHint && (
        <div className="console-fs-hint" role="status">
          Press <kbd>F11</kbd> or use the toolbar at the top of the screen to exit full screen
        </div>
      )}

      <ConfirmDialog
        open={confirmForceStop}
        onClose={() => setConfirmForceStop(false)}
        onConfirm={doForceStop}
        title="Force stop virtual machine"
        danger
        busy={busy}
        confirmLabel="Force Stop"
        message={`This immediately terminates "${vm.name}" without asking the guest OS to shut down first - like pulling the power. Use this when Shutdown doesn't work (for example, at a boot menu or installer screen). Unsaved work inside the guest may be lost.`}
      />
    </div>
  );
}

function ConsoleHeader({
  title,
  status,
  windowStyle,
  onEnterFullscreen,
}: {
  title: string;
  status?: VmSummary["status"];
  windowStyle: WindowStyle;
  onEnterFullscreen: () => void;
}) {
  return (
    <div className={["console-header", windowStyle === "windows" ? "console-header--windows" : ""].filter(Boolean).join(" ")} data-tauri-drag-region>
      <div className="console-header__label" data-tauri-drag-region>
        <span className="console-header__name">{title}</span>
        {status && <Badge tone={status === "running" ? "good" : status === "paused" ? "warn" : "neutral"}>{capitalize(status)}</Badge>}
      </div>
      <WindowControls style={windowStyle} maximized={false} onClose={() => void closeWindow()} onMinimize={() => void minimizeWindow()} onMaximize={onEnterFullscreen} maximizeLabel="Enter Full Screen" />
    </div>
  );
}

function Indicator({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const muted = value === "—" || value === "Unavailable";
  return (
    <div className="console-indicator">
      <span className="console-indicator__icon">{icon}</span>
      <span className="console-indicator__body">
        <span className="console-indicator__label">{label}</span>
        <span className={["console-indicator__value", muted ? "console-indicator__value--muted" : ""].filter(Boolean).join(" ")}>{value}</span>
      </span>
    </div>
  );
}

function ControlButton({
  icon,
  label,
  primary,
  danger,
  disabled,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={["console-control", primary ? "is-primary" : "", danger ? "is-danger" : ""].filter(Boolean).join(" ")}
      disabled={disabled || busy}
      onClick={onClick}
    >
      <span className="console-control__icon">{icon}</span>
      <span className="console-control__label">{label}</span>
    </button>
  );
}

function FullscreenToolbar({
  visible,
  vm,
  busy,
  onEnter,
  onLeave,
  onPause,
  onResume,
  onRestart,
  onExit,
  scalingMode,
  keepAspectRatio,
  autoResizeGuest,
  onScalingModeChange,
  onKeepAspectRatioChange,
  onAutoResizeGuestChange,
}: {
  visible: boolean;
  vm: VmSummary;
  busy: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
  scalingMode: ScalingMode;
  keepAspectRatio: boolean;
  autoResizeGuest: boolean;
  onScalingModeChange: (mode: ScalingMode) => void;
  onKeepAspectRatioChange: (value: boolean) => void;
  onAutoResizeGuestChange: (value: boolean) => void;
}) {
  const running = vm.status === "running";
  const paused = vm.status === "paused";
  const stopped = vm.status === "stopped";

  return (
    <div className={["console-fs-toolbar", visible ? "is-visible" : ""].filter(Boolean).join(" ")} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="console-fs-toolbar__label">
        <span className="console-fs-toolbar__name">{vm.name}</span>
        <Badge tone={running ? "good" : paused ? "warn" : "neutral"}>{capitalize(vm.status)}</Badge>
      </div>
      <div className="console-fs-toolbar__actions">
        {paused ? (
          <FsToolbarButton icon={<PlayIcon size={14} />} label="Resume" disabled={busy} onClick={onResume} />
        ) : (
          <FsToolbarButton icon={<PauseIcon size={14} />} label="Pause" disabled={busy || stopped} onClick={onPause} />
        )}
        <FsToolbarButton icon={<RestartIcon size={14} />} label="Restart" disabled={busy || stopped} onClick={onRestart} />
        <DisplayQuickMenu
          scalingMode={scalingMode}
          keepAspectRatio={keepAspectRatio}
          autoResizeGuest={autoResizeGuest}
          onScalingModeChange={onScalingModeChange}
          onKeepAspectRatioChange={onKeepAspectRatioChange}
          onAutoResizeGuestChange={onAutoResizeGuestChange}
        />
        <FsToolbarButton icon={<ExitFullscreenIcon size={14} />} label="Exit Full Screen" onClick={onExit} />
      </div>
    </div>
  );
}

function FsToolbarButton({ icon, label, disabled, onClick }: { icon: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="console-fs-toolbar__btn" disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DisplayQuickMenu({
  scalingMode,
  keepAspectRatio,
  autoResizeGuest,
  onScalingModeChange,
  onKeepAspectRatioChange,
  onAutoResizeGuestChange,
}: {
  scalingMode: ScalingMode;
  keepAspectRatio: boolean;
  autoResizeGuest: boolean;
  onScalingModeChange: (mode: ScalingMode) => void;
  onKeepAspectRatioChange: (value: boolean) => void;
  onAutoResizeGuestChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);

  return (
    <div className="console-fs-toolbar__menu" ref={rootRef}>
      <FsToolbarButton icon={<MonitorIcon size={14} />} label="Display" onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="console-fs-toolbar__panel">
          <Field label="Scaling Mode">
            <SegmentedControl aria-label="Scaling mode" size="sm" options={SCALING_MODE_OPTIONS} value={scalingMode} onChange={onScalingModeChange} />
          </Field>
          <div className="console-fs-toolbar__panel-row">
            <span>Keep Aspect Ratio</span>
            <Toggle checked={keepAspectRatio} onChange={onKeepAspectRatioChange} disabled={scalingMode !== "stretch"} label="Keep aspect ratio" />
          </div>
          <div className="console-fs-toolbar__panel-row">
            <span>Auto Resize Guest</span>
            <Toggle checked={autoResizeGuest} onChange={onAutoResizeGuestChange} label="Auto resize guest" />
          </div>
        </div>
      )}
    </div>
  );
}
