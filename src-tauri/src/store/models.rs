//! Persisted data model. Field names cross the IPC boundary as `camelCase` so
//! the TypeScript side reads naturally (see `src/types.ts`).

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Settings (%APPDATA%\Thomsen VM\settings.json)
// ---------------------------------------------------------------------------

fn default_window_style() -> String {
    "macos".into()
}
fn default_true() -> bool {
    true
}
fn default_cpu_cores() -> u32 {
    2
}
fn default_ram_mb() -> u32 {
    2048
}
fn default_disk_gb() -> u32 {
    40
}
fn default_network_mode() -> String {
    "nat".into()
}
fn default_scaling_mode() -> String {
    "fit".into()
}
/// Every VM created before firmware selection existed booted Legacy BIOS
/// (QEMU's implicit default - no pflash args at all), so a config on disk
/// with no `firmware` key must keep meaning exactly that, not silently
/// switch to UEFI and risk an existing install failing to boot. New VMs
/// always write this field explicitly (defaulting to "uefi" in the Create
/// VM wizard) - this default only ever applies to pre-existing configs.
fn default_firmware() -> String {
    "bios".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Shown on the Dashboard greeting ("Good afternoon, {username}") and
    /// throughout the app. Chosen during first-run setup (pre-filled from
    /// the real Windows username as a starting suggestion, but freely
    /// editable there and later in Settings) - never the same thing as the
    /// OS account name once set.
    #[serde(default)]
    pub username: String,
    /// "dark" | "light" | "system".
    pub theme: String,
    /// "macos" | "windows" - cosmetic title-bar control style only.
    #[serde(default = "default_window_style")]
    pub window_style: String,
    /// Whether the first-run setup wizard has been completed. Logging out or
    /// locking the app must never touch this - only "Reset First-Run Setup"
    /// does.
    #[serde(default)]
    pub onboarding_completed: bool,
    /// Whether a fresh launch (not a Logout/Lock while already running,
    /// which always re-locks regardless of this) shows the lock screen when
    /// a password is set. Off = trust this device at launch; the user can
    /// still lock the app manually at any time either way.
    #[serde(default = "default_true")]
    pub require_login_on_startup: bool,

    #[serde(default)]
    pub start_with_windows: bool,
    #[serde(default = "default_true")]
    pub remember_window_position: bool,
    #[serde(default = "default_true")]
    pub check_for_updates: bool,
    #[serde(default = "default_true")]
    pub confirm_before_delete_vms: bool,

    /// Root folder new VMs are created under. `None` = the default
    /// `Documents\Thomsen VM\VirtualMachines` location.
    #[serde(default)]
    pub default_vm_folder: Option<String>,
    #[serde(default = "default_cpu_cores")]
    pub default_cpu_cores: u32,
    #[serde(default = "default_ram_mb")]
    pub default_ram_mb: u32,
    #[serde(default = "default_disk_gb")]
    pub default_disk_gb: u32,
    /// "nat" | "bridged" | "offline".
    #[serde(default = "default_network_mode")]
    pub default_network_mode: String,

    /// Last known window placement, applied on startup only when
    /// `remember_window_position` is true. `None` before the first save.
    #[serde(default)]
    pub window_geometry: Option<WindowGeometry>,

    // -- VM display / full-screen (Settings -> Display) --------------------
    /// Which physical monitor the VM Console goes full-screen on, matched by
    /// Tauri's `Monitor.name` (Windows: the adapter device name, e.g.
    /// `\\.\DISPLAY1`). `None` = whichever monitor the Console window is
    /// currently on when full-screen is entered.
    #[serde(default)]
    pub vm_monitor: Option<String>,
    /// "fit" | "stretch" | "native".
    #[serde(default = "default_scaling_mode")]
    pub scaling_mode: String,
    /// Only meaningful for `scaling_mode: "stretch"` - "fit" and "native"
    /// preserve/show native proportions by definition either way. When true,
    /// stretch is constrained to a uniform (non-distorting) scale instead of
    /// filling the window exactly.
    #[serde(default = "default_true")]
    pub keep_aspect_ratio: bool,
    /// Ask the guest to change its own resolution to match the window/
    /// monitor size (VNC `ExtendedDesktopSize`) whenever it changes, instead
    /// of only visually scaling the existing framebuffer.
    #[serde(default = "default_true")]
    pub auto_resize_guest: bool,
    /// Whether to restore `last_fullscreen` the next time a VM Console opens.
    #[serde(default = "default_true")]
    pub remember_fullscreen: bool,
    #[serde(default)]
    pub last_fullscreen: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            username: String::new(),
            theme: "dark".into(),
            window_style: default_window_style(),
            onboarding_completed: false,
            require_login_on_startup: true,
            start_with_windows: false,
            remember_window_position: true,
            check_for_updates: true,
            confirm_before_delete_vms: true,
            default_vm_folder: None,
            default_cpu_cores: default_cpu_cores(),
            default_ram_mb: default_ram_mb(),
            default_disk_gb: default_disk_gb(),
            default_network_mode: default_network_mode(),
            window_geometry: None,
            vm_monitor: None,
            scaling_mode: default_scaling_mode(),
            keep_aspect_ratio: true,
            auto_resize_guest: true,
            remember_fullscreen: true,
            last_fullscreen: false,
        }
    }
}

// ---------------------------------------------------------------------------
// Virtual machines (<vm-folder>\config.json)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VmConfig {
    pub id: String,
    pub name: String,
    /// "windows" | "linux" | "other".
    pub os_family: String,
    /// One of the known presets ("kali-linux", "ubuntu", "debian",
    /// "arch-linux", "windows-11", "windows-10") or `None` for a custom OS.
    pub os_preset: Option<String>,
    pub iso_path: Option<String>,
    pub iso_name: Option<String>,
    pub cpu_cores: u32,
    pub ram_mb: u32,
    pub disk_gb: u32,
    /// "nat" | "bridged" | "offline".
    pub network_mode: String,
    /// "uefi" | "bios". See `default_firmware` for why the on-disk default
    /// must be "bios", not "uefi".
    #[serde(default = "default_firmware")]
    pub firmware: String,
    pub created_at: String,
    pub last_started_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub description: Option<String>,
}
