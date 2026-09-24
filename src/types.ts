/**
 * TypeScript mirror of the Rust store model and command results. Field names
 * are camelCase on both sides of the IPC boundary.
 */

export type ThemeSetting = "dark" | "light" | "system";
export type WindowStyle = "macos" | "windows";
export type NetworkMode = "nat" | "bridged" | "offline";
export type OsFamily = "windows" | "linux" | "other";
export type OsPreset = "kali-linux" | "ubuntu" | "debian" | "arch-linux" | "windows-11" | "windows-10";
export type VmRuntimeStatus = "stopped" | "starting" | "running" | "paused" | "stopping";
export type ScalingMode = "fit" | "stretch" | "native";
export type FirmwareMode = "uefi" | "bios";

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface Settings {
  /** Shown on the Dashboard greeting and throughout the app. Editable in
   * Settings; not the same thing as the Windows account name once set. */
  username: string;
  theme: ThemeSetting;
  windowStyle: WindowStyle;
  onboardingCompleted: boolean;
  /** Whether a fresh app launch (not a manual Logout/Lock, which always
   * re-locks regardless) shows the lock screen when a password is set. */
  requireLoginOnStartup: boolean;
  startWithWindows: boolean;
  rememberWindowPosition: boolean;
  checkForUpdates: boolean;
  confirmBeforeDeleteVms: boolean;
  defaultVmFolder: string | null;
  defaultCpuCores: number;
  defaultRamMb: number;
  defaultDiskGb: number;
  defaultNetworkMode: NetworkMode;
  windowGeometry: WindowGeometry | null;

  /** Monitor the VM Console goes full-screen on, matched by `Monitor.name`
   * (e.g. `\\.\DISPLAY1`). `null` = whichever monitor the window is on. */
  vmMonitor: string | null;
  scalingMode: ScalingMode;
  /** Only meaningful for `scalingMode: "stretch"`. */
  keepAspectRatio: boolean;
  autoResizeGuest: boolean;
  rememberFullscreen: boolean;
  lastFullscreen: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  dataDir: string;
  logsPath: string;
  loadWarnings: string[];
}

/** The backend's structured error shape - always a plain message, with
 * `reason`/`suggestedFix`/`technical` present only for operational failures
 * (see `error.rs`). */
export interface AppErrorShape {
  message: string;
  reason?: string;
  suggestedFix?: string;
  technical?: string;
}

/** Outcome of one password check - a wrong guess or an active cooldown are
 * both normal results, not thrown errors. */
export interface UnlockResult {
  ok: boolean;
  message: string;
  retryAfterSecs: number | null;
}

// ---------------------------------------------------------------------------
// System / host
// ---------------------------------------------------------------------------

export interface HostFacts {
  username: string;
  computerName: string;
  cpuName: string;
  cpuCoresPhysical: number;
  cpuCoresLogical: number;
  ramTotalMb: number;
  gpuName: string | null;
  windowsVersion: string;
  virtualizationFirmwareEnabled: boolean | null;
  hypervPresent: boolean;
  hypervRunning: boolean;
}

export interface LiveUsage {
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
}

export interface StorageInfo {
  drive: string;
  totalGb: number;
  availableGb: number;
}

export interface ProviderAvailability {
  backendName: string;
  available: boolean;
  version: string | null;
  reason: string | null;
  suggestedFix: string | null;
}

// ---------------------------------------------------------------------------
// Virtual machines
// ---------------------------------------------------------------------------

export interface VmConfig {
  id: string;
  name: string;
  osFamily: OsFamily;
  osPreset: OsPreset | null;
  isoPath: string | null;
  isoName: string | null;
  cpuCores: number;
  ramMb: number;
  diskGb: number;
  networkMode: NetworkMode;
  /** "uefi" | "bios". Real OVMF/EDK2 firmware when "uefi" - see
   * `virtualization/qemu.rs`'s `ensure_uefi_firmware`. */
  firmware: FirmwareMode;
  createdAt: string;
  lastStartedAt: string | null;
}

export interface VmSummary extends VmConfig {
  status: VmRuntimeStatus;
  diskUsedMb: number | null;
  folder: string;
}

/** Where to reach the running VM's guest display: QEMU's own VNC-over-
 * WebSocket listener (loopback-only), rendered by `VmDisplay.tsx` via noVNC. */
export interface VmDisplayInfo {
  host: string;
  wsPort: number;
}

export interface VmLiveStats {
  cpuPercent: number | null;
  ramUsedMb: number | null;
  diskReadBytesPerSec: number | null;
  diskWriteBytesPerSec: number | null;
  networkAvailable: boolean;
}

export interface SnapshotInfo {
  id: string;
  name: string;
  createdAt: string;
  description: string | null;
}

export interface CreateVmInput {
  name: string;
  osFamily: OsFamily;
  osPreset: OsPreset | null;
  isoPath: string | null;
  cpuCores: number;
  ramMb: number;
  diskGb: number;
  networkMode: NetworkMode;
  firmware: FirmwareMode;
}

export interface UpdateVmInput {
  name?: string;
  cpuCores?: number;
  ramMb?: number;
  networkMode?: NetworkMode;
  firmware?: FirmwareMode;
}

export interface AutomaticHardware {
  cpuCores: number;
  ramMb: number;
  maxCpuCores: number;
  maxRamMb: number;
}

export interface DetectedIso {
  fileName: string;
  sizeBytes: number;
  osFamilyGuess: OsFamily | null;
  presetGuess: OsPreset | null;
  labelGuess: string | null;
}
