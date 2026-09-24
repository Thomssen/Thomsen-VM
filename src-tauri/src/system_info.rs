//! Real host hardware/OS detection for the Dashboard and System page.
//!
//! Cheap, frequently-changing numbers (CPU%, RAM used) come from `sysinfo`
//! and are meant to be polled every few seconds. Facts that rarely change
//! within a session (CPU model, GPU, Windows build, firmware virtualization
//! flag, Hyper-V service state) come from one combined PowerShell/CIM query -
//! call this once per page visit, not on a timer.

use std::path::Path;
use std::process::Stdio;

use serde::Serialize;
use sysinfo::{Disks, System};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostFacts {
    pub username: String,
    pub computer_name: String,
    pub cpu_name: String,
    pub cpu_cores_physical: u32,
    pub cpu_cores_logical: u32,
    pub ram_total_mb: u64,
    pub gpu_name: Option<String>,
    pub windows_version: String,
    /// `None` when the host CPU doesn't expose the property (very old CPUs)
    /// rather than guessing.
    pub virtualization_firmware_enabled: Option<bool>,
    pub hyperv_present: bool,
    pub hyperv_running: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveUsage {
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub drive: String,
    pub total_gb: f64,
    pub available_gb: f64,
}

pub fn live_usage(sys: &mut System) -> LiveUsage {
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let cpu_percent = sys.global_cpu_usage();
    LiveUsage { cpu_percent, ram_used_mb: sys.used_memory() / 1024 / 1024, ram_total_mb: sys.total_memory() / 1024 / 1024 }
}

/// Free/total space (GB) on the drive that holds `path` (created if it
/// doesn't exist yet, e.g. a not-yet-created VM folder, by checking its
/// nearest existing ancestor instead).
pub fn storage_for_path(path: &Path) -> Option<StorageInfo> {
    let mut probe = path.to_path_buf();
    while !probe.exists() {
        match probe.parent() {
            Some(p) => probe = p.to_path_buf(),
            None => break,
        }
    }
    let disks = Disks::new_with_refreshed_list();
    let mut best: Option<(&std::path::Path, &sysinfo::Disk)> = None;
    for disk in disks.list() {
        let mount = disk.mount_point();
        if probe.starts_with(mount) {
            if best.map(|(m, _)| mount.as_os_str().len() > m.as_os_str().len()).unwrap_or(true) {
                best = Some((mount, disk));
            }
        }
    }
    best.map(|(mount, disk)| StorageInfo {
        drive: mount.display().to_string(),
        total_gb: disk.total_space() as f64 / 1024.0 / 1024.0 / 1024.0,
        available_gb: disk.available_space() as f64 / 1024.0 / 1024.0 / 1024.0,
    })
}

pub fn host_facts() -> AppResult<HostFacts> {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_name = sys.cpus().first().map(|c| c.brand().trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "Unknown CPU".into());
    let cpu_cores_logical = sys.cpus().len() as u32;
    let cpu_cores_physical = sys.physical_core_count().unwrap_or(cpu_cores_logical as usize) as u32;
    let ram_total_mb = sys.total_memory() / 1024 / 1024;

    let username = std::env::var("USERNAME").unwrap_or_else(|_| "there".into());
    let computer_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "this PC".into());

    let windows = query_windows_facts();

    // A running hypervisor is definitive proof virtualization is enabled -
    // it cannot run without VT-x/AMD-V active - and takes priority over the
    // raw firmware flag, which goes unreliable exactly when something
    // (Hyper-V, WSL2, Windows Sandbox, VBS) already has the extensions
    // claimed. `None` only when neither signal could be read at all.
    let virtualization_firmware_enabled = windows.as_ref().ok().map(|w| w.hypervisor_present || w.virtualization_firmware_enabled.unwrap_or(false));

    Ok(HostFacts {
        username,
        computer_name,
        cpu_name,
        cpu_cores_physical,
        cpu_cores_logical,
        ram_total_mb,
        gpu_name: windows.as_ref().ok().and_then(|w| w.gpu_name.clone()),
        windows_version: windows.as_ref().map(|w| w.windows_version()).unwrap_or_else(|_| "Windows".into()),
        virtualization_firmware_enabled,
        hyperv_present: windows.as_ref().map(|w| w.hyper_v_present).unwrap_or(false),
        hyperv_running: windows.as_ref().map(|w| w.hyper_v_running).unwrap_or(false),
    })
}

#[derive(Debug, serde::Deserialize)]
struct WindowsFactsRaw {
    #[serde(rename = "VirtualizationFirmwareEnabled")]
    virtualization_firmware_enabled: Option<bool>,
    /// `Win32_ComputerSystem.HypervisorPresent` - true whenever a hypervisor
    /// is already running under this Windows install (Hyper-V, WSL2,
    /// Windows Sandbox, Virtualization-Based Security, ...). This is the
    /// more reliable signal: once something else has claimed the CPU's
    /// virtualization extensions, `VirtualizationFirmwareEnabled` can report
    /// `false` even though virtualization is demonstrably enabled and
    /// working (a hypervisor cannot run at all without it) - `systeminfo`
    /// hits the exact same wall ("A hypervisor has been detected. Features
    /// required for Hyper-V will not be displayed.").
    #[serde(rename = "HypervisorPresent")]
    hypervisor_present: bool,
    #[serde(rename = "GpuName")]
    gpu_name: Option<String>,
    #[serde(rename = "ProductName")]
    product_name: Option<String>,
    #[serde(rename = "DisplayVersion")]
    display_version: Option<String>,
    #[serde(rename = "Build")]
    build: Option<String>,
    #[serde(rename = "HyperVPresent")]
    hyper_v_present: bool,
    #[serde(rename = "HyperVRunning")]
    hyper_v_running: bool,
}

impl WindowsFactsRaw {
    fn windows_version(&self) -> String {
        let name = self.product_name.clone().unwrap_or_else(|| "Windows".into());
        match (&self.display_version, &self.build) {
            (Some(v), Some(b)) => format!("{name} {v} (Build {b})"),
            (None, Some(b)) => format!("{name} (Build {b})"),
            _ => name,
        }
    }
}

const WINDOWS_FACTS_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$hyperv = Get-Service -Name vmms -ErrorAction SilentlyContinue
[PSCustomObject]@{
  VirtualizationFirmwareEnabled = $cpu.VirtualizationFirmwareEnabled
  HypervisorPresent = [bool]$cs.HypervisorPresent
  GpuName = $gpu.Name
  ProductName = $os.Caption
  DisplayVersion = $cv.DisplayVersion
  Build = $cv.CurrentBuildNumber
  HyperVPresent = [bool]$hyperv
  HyperVRunning = [bool]($hyperv -and $hyperv.Status -eq 'Running')
} | ConvertTo-Json -Compress
"#;

fn query_windows_facts() -> AppResult<WindowsFactsRaw> {
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", WINDOWS_FACTS_SCRIPT]);
    cmd.stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = cmd.output().map_err(|e| AppError::msg("Could not query Windows system details.").technical(e.to_string()))?;
    let text = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(text.trim()).map_err(|e| AppError::msg("Could not read Windows system details.").technical(format!("{e}: {text}")))
}
