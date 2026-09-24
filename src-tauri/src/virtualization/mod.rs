//! Virtualization abstraction layer.
//!
//! ```text
//! Thomsen VM UI (commands/vms.rs)
//!         |
//!    VirtualMachineProvider   <-- this module
//!         |
//!      QemuProvider           <-- qemu.rs (spawns qemu-system-x86_64 + QMP)
//! ```
//!
//! Every backend-specific detail (process args, the QMP wire protocol, disk
//! image format) lives behind `QemuProvider` in `qemu.rs`. Commands and the
//! frontend only ever see the types in this file, so a second backend
//! (Windows Hypervisor Platform, a container-based engine, ...) could be
//! added later by implementing this same trait, without touching the UI.
//!
//! `VirtualMachineProvider` uses plain `async fn` (stable Rust, no
//! `async-trait` crate needed) rather than a `dyn`-safe signature, because
//! `AppState` only ever needs to hold one concrete provider at a time
//! (`QemuProvider`) - there is no runtime need to type-erase multiple
//! backends behind one trait object. Adding a second backend means adding a
//! second concrete type and choosing between them at startup, not changing
//! this trait.

pub mod qemu;
pub mod qmp;

use std::path::Path;

use serde::Serialize;

use crate::error::AppResult;
use crate::store::models::{SnapshotInfo, VmConfig};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAvailability {
    pub backend_name: String,
    pub available: bool,
    pub version: Option<String>,
    /// Why unavailable, in user terms - `None` when `available` is true.
    pub reason: Option<String>,
    pub suggested_fix: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VmRuntimeStatus {
    Stopped,
    Starting,
    Running,
    Paused,
    Stopping,
}

/// How to reach the running VM's display. The guest framebuffer is served as
/// VNC-over-WebSocket (QEMU's own `websocket=` suboption on `-vnc`, no proxy
/// needed) so the frontend can render it directly into a `<canvas>` with
/// noVNC instead of QEMU opening its own separate OS window - see
/// `qemu.rs::start_vm` and `src/components/vm/VmDisplay.tsx`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VmDisplayInfo {
    pub host: String,
    pub ws_port: u16,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VmLiveStats {
    pub cpu_percent: Option<f32>,
    pub ram_used_mb: Option<u64>,
    pub disk_read_bytes_per_sec: Option<u64>,
    pub disk_write_bytes_per_sec: Option<u64>,
    /// Per-VM network throughput isn't observable from the host without a
    /// guest agent, so this is always `false` today rather than a made-up
    /// number - the console shows "Unavailable" for network when this is
    /// false instead of a fake reading.
    pub network_available: bool,
}

#[allow(async_fn_in_trait)]
pub trait VirtualMachineProvider: Send + Sync {
    fn availability(&self) -> ProviderAvailability;

    /// Create the backing disk image for a freshly-created VM. The VM's
    /// folder (and `config.json`) already exist by the time this is called -
    /// see `vms::create_vm_folder`.
    async fn create_vm(&self, config: &VmConfig, vm_dir: &Path) -> AppResult<()>;

    async fn start_vm(&self, config: &VmConfig, vm_dir: &Path) -> AppResult<()>;

    /// Graceful ACPI shutdown request. The guest OS decides how to respond,
    /// same as pressing a physical power button - it is not guaranteed to
    /// power off immediately.
    async fn stop_vm(&self, vm_id: &str) -> AppResult<()>;

    /// Immediately terminates the VM process. Used when a graceful shutdown
    /// doesn't respond, or the user explicitly asks to force-stop.
    async fn kill_vm(&self, vm_id: &str) -> AppResult<()>;

    async fn pause_vm(&self, vm_id: &str) -> AppResult<()>;
    async fn resume_vm(&self, vm_id: &str) -> AppResult<()>;
    async fn reset_vm(&self, vm_id: &str) -> AppResult<()>;
    async fn send_ctrl_alt_del(&self, vm_id: &str) -> AppResult<()>;

    async fn status(&self, vm_id: &str) -> VmRuntimeStatus;
    async fn live_stats(&self, vm_id: &str) -> Option<VmLiveStats>;

    /// `None` when the VM isn't running (or the backend has no display to
    /// offer, e.g. a future non-QEMU provider) - the frontend shows its
    /// existing "start this VM to open its display" state in that case
    /// rather than trying to connect anywhere.
    async fn display_info(&self, vm_id: &str) -> Option<VmDisplayInfo>;

    /// Snapshot operations require the VM to be stopped (they operate
    /// directly on the qcow2 file via `qemu-img`, which needs exclusive
    /// access) - callers should check `status()` first and surface that
    /// requirement in the UI rather than relying on this call to enforce it
    /// after the fact.
    async fn create_snapshot(&self, vm_dir: &Path, name: &str, description: Option<String>) -> AppResult<SnapshotInfo>;
    async fn restore_snapshot(&self, vm_dir: &Path, snapshot: &SnapshotInfo) -> AppResult<()>;
    async fn delete_snapshot(&self, vm_dir: &Path, snapshot: &SnapshotInfo) -> AppResult<()>;
}

/// Shared safety ceiling: never let a VM claim so much of the host's CPU or
/// RAM that Windows itself becomes unusable while it runs. Used both by the
/// "Automatic" hardware suggestion and as a hard check before a VM starts.
pub struct HostBudget {
    pub logical_cores: u32,
    pub total_ram_mb: u64,
}

pub struct SafeLimits {
    pub max_cpu_cores: u32,
    pub max_ram_mb: u64,
}

pub fn safe_limits(host: &HostBudget) -> SafeLimits {
    // Leave at least 1 core and never take more than 75% of them.
    let max_cpu_cores = (host.logical_cores.saturating_sub(1)).max(1).min((host.logical_cores * 3) / 4).max(1);
    // Leave the larger of 2 GB or 25% of total RAM for the host.
    let reserve_mb = (host.total_ram_mb / 4).max(2048);
    let max_ram_mb = host.total_ram_mb.saturating_sub(reserve_mb).max(512);
    SafeLimits { max_cpu_cores, max_ram_mb }
}

pub fn recommend_automatic(host: &HostBudget, preset_cpu: u32, preset_ram_mb: u32) -> (u32, u32) {
    let limits = safe_limits(host);
    let cpu = preset_cpu.min(limits.max_cpu_cores).max(1);
    let ram = (preset_ram_mb as u64).min(limits.max_ram_mb).max(512) as u32;
    (cpu, ram)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A budget PC (2 cores, 4 GB) must still leave the host usable: at least
    /// 1 core and at least 2 GB free, never negative/overflowing.
    #[test]
    fn safe_limits_low_spec_host_leaves_headroom() {
        let limits = safe_limits(&HostBudget { logical_cores: 2, total_ram_mb: 4096 });
        assert_eq!(limits.max_cpu_cores, 1, "must always leave at least 1 core for the host");
        assert!(limits.max_ram_mb <= 4096 - 2048, "must leave at least 2 GB for the host");
        assert!(limits.max_ram_mb >= 512, "must never floor below the hard minimum");
    }

    /// A beefy host (32 cores, 128 GB) should still cap at 75% of cores and
    /// leave the larger of 2 GB / 25% of RAM for the host, not hand over
    /// everything.
    #[test]
    fn safe_limits_high_spec_host_still_caps() {
        let limits = safe_limits(&HostBudget { logical_cores: 32, total_ram_mb: 131072 });
        assert_eq!(limits.max_cpu_cores, 24, "75% of 32 cores");
        assert_eq!(limits.max_ram_mb, 131072 - 32768, "25% of 128 GB reserved, since it exceeds the 2 GB floor");
    }

    /// A single-core host is a degenerate edge case that must not panic or
    /// underflow - it still has to report *something* usable.
    #[test]
    fn safe_limits_single_core_host_does_not_panic() {
        let limits = safe_limits(&HostBudget { logical_cores: 1, total_ram_mb: 2048 });
        assert_eq!(limits.max_cpu_cores, 1);
        assert!(limits.max_ram_mb >= 512);
    }

    /// "Automatic" must never recommend more than what's actually safe, even
    /// when the OS preset itself asks for more than this host can spare.
    #[test]
    fn recommend_automatic_clamps_a_preset_that_exceeds_the_host() {
        let host = HostBudget { logical_cores: 4, total_ram_mb: 8192 };
        // Windows 11's preset (4 cores, 8192 MB) exactly matches host specs,
        // which after reserving headroom is not actually safe to hand over
        // in full.
        let (cpu, ram_mb) = recommend_automatic(&host, 4, 8192);
        let limits = safe_limits(&host);
        assert!(cpu <= limits.max_cpu_cores);
        assert!(ram_mb as u64 <= limits.max_ram_mb);
    }

    /// A modest preset on a powerful host should be granted as-is, not
    /// artificially inflated up to the safety ceiling.
    #[test]
    fn recommend_automatic_does_not_inflate_a_modest_preset() {
        let host = HostBudget { logical_cores: 16, total_ram_mb: 32768 };
        let (cpu, ram_mb) = recommend_automatic(&host, 2, 2048);
        assert_eq!(cpu, 2);
        assert_eq!(ram_mb, 2048);
    }
}
