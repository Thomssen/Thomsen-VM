//! VM CRUD and lifecycle commands. This is the *only* layer that is allowed
//! to know both "how VMs are stored" (`crate::vms`) and "how VMs actually
//! run" (`crate::virtualization`) - the frontend only ever sees the plain
//! data types below.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::store;
use crate::store::models::{SnapshotInfo, VmConfig};
use crate::system_info;
use crate::util;
use crate::virtualization::{self, HostBudget, VirtualMachineProvider, VmDisplayInfo, VmLiveStats, VmRuntimeStatus};
use crate::{iso_detect, vms};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VmSummary {
    #[serde(flatten)]
    pub config: VmConfig,
    pub status: VmRuntimeStatus,
    pub disk_used_mb: Option<u64>,
    pub folder: String,
}

async fn summarize(provider: &impl VirtualMachineProvider, config: VmConfig, vm_dir: &Path) -> VmSummary {
    let status = provider.status(&config.id).await;
    let disk_used_mb = vms::disk_used_bytes(vm_dir).map(|b| b / 1024 / 1024);
    VmSummary { config, status, disk_used_mb, folder: vm_dir.display().to_string() }
}

#[tauri::command]
pub async fn list_vms(app: AppHandle, state: State<'_, AppState>) -> AppResult<Vec<VmSummary>> {
    let vm_root = state.vm_root(&app)?;
    let (found, warnings) = vms::list_vms(&vm_root);
    for w in warnings {
        state.logger.warn("vm-list", &w);
    }
    let mut out = Vec::with_capacity(found.len());
    for (config, dir) in found {
        out.push(summarize(&state.provider, config, &dir).await);
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_vm(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<VmSummary> {
    let vm_root = state.vm_root(&app)?;
    let dir = vms::find_vm_dir(&vm_root, &id)?;
    let config = vms::read_vm(&dir)?;
    Ok(summarize(&state.provider, config, &dir).await)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVmInput {
    pub name: String,
    pub os_family: String,
    pub os_preset: Option<String>,
    pub iso_path: Option<String>,
    pub cpu_cores: u32,
    pub ram_mb: u32,
    pub disk_gb: u32,
    pub network_mode: String,
    /// "uefi" | "bios".
    pub firmware: String,
}

fn validate_hardware(cpu_cores: u32, ram_mb: u32, disk_gb: u32) -> AppResult<()> {
    let host = system_info::host_facts()?;
    let limits = virtualization::safe_limits(&HostBudget { logical_cores: host.cpu_cores_logical, total_ram_mb: host.ram_total_mb });
    if cpu_cores < 1 || cpu_cores > limits.max_cpu_cores {
        return Err(AppError::invalid(format!(
            "CPU cores must be between 1 and {} on this PC, to keep Windows responsive.",
            limits.max_cpu_cores
        )));
    }
    if (ram_mb as u64) < 256 || (ram_mb as u64) > limits.max_ram_mb {
        return Err(AppError::invalid(format!(
            "RAM must be between 256 MB and {} MB on this PC, to keep Windows responsive.",
            limits.max_ram_mb
        )));
    }
    if disk_gb < 1 || disk_gb > 4000 {
        return Err(AppError::invalid("Disk size must be between 1 GB and 4000 GB."));
    }
    Ok(())
}

#[tauri::command]
pub async fn create_vm(app: AppHandle, state: State<'_, AppState>, input: CreateVmInput) -> AppResult<VmSummary> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::invalid("Give the virtual machine a name."));
    }
    if name.chars().count() > 80 {
        return Err(AppError::invalid("That name is too long."));
    }
    if !["windows", "linux", "other"].contains(&input.os_family.as_str()) {
        return Err(AppError::invalid("Unknown operating system family."));
    }
    if !["nat", "bridged", "offline"].contains(&input.network_mode.as_str()) {
        return Err(AppError::invalid("Unknown network mode."));
    }
    if !["uefi", "bios"].contains(&input.firmware.as_str()) {
        return Err(AppError::invalid("Unknown firmware mode."));
    }
    validate_hardware(input.cpu_cores, input.ram_mb, input.disk_gb)?;

    let iso_name = input.iso_path.as_deref().and_then(|p| Path::new(p).file_name()).and_then(|n| n.to_str()).map(str::to_string);

    let config = VmConfig {
        id: store::uuid(),
        name,
        os_family: input.os_family,
        os_preset: input.os_preset,
        iso_path: input.iso_path,
        iso_name,
        cpu_cores: input.cpu_cores,
        ram_mb: input.ram_mb,
        disk_gb: input.disk_gb,
        network_mode: input.network_mode,
        firmware: input.firmware,
        created_at: util::now(),
        last_started_at: None,
    };

    let vm_root = state.vm_root(&app)?;
    let vm_dir = vms::create_vm_folder(&vm_root, &config)?;

    if let Err(e) = state.provider.create_vm(&config, &vm_dir).await {
        // Don't leave a half-formed VM folder behind for the user to puzzle over.
        let _ = vms::delete_vm_folder(&vm_dir);
        state.logger.error("vm-create", &format!("\"{}\": {}", config.name, e.technical.as_deref().unwrap_or(&e.message)));
        return Err(e);
    }

    state
        .logger
        .info("vm-create", &format!("Created \"{}\" ({} cores, {} MB RAM, {} GB disk)", config.name, config.cpu_cores, config.ram_mb, config.disk_gb));

    Ok(summarize(&state.provider, config, &vm_dir).await)
}

#[tauri::command]
pub async fn start_vm(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let vm_dir = vms::find_vm_dir(&state.vm_root(&app)?, &id)?;
    let mut config = vms::read_vm(&vm_dir)?;
    validate_hardware(config.cpu_cores, config.ram_mb, config.disk_gb).map_err(|_| {
        AppError::with_fix(
            "This VM's hardware settings no longer fit this PC.",
            "Its configured CPU or RAM exceeds what's safe to allocate on this machine.",
            "Lower its CPU cores or RAM in VM Settings, then try starting it again.",
        )
    })?;

    match state.provider.start_vm(&config, &vm_dir).await {
        Ok(()) => {
            config.last_started_at = Some(util::now());
            vms::write_vm_config(&vm_dir, &config)?;
            state.logger.info("vm-start", &format!("Started \"{}\"", config.name));
            Ok(())
        }
        Err(e) => {
            state.logger.error("vm-start", &format!("\"{}\": {}", config.name, e.technical.as_deref().unwrap_or(&e.message)));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn stop_vm(state: State<'_, AppState>, id: String, force: bool) -> AppResult<()> {
    let result = if force { state.provider.kill_vm(&id).await } else { state.provider.stop_vm(&id).await };
    match &result {
        Ok(()) => state.logger.info("vm-stop", &format!("{} VM {id}", if force { "Force-stopped" } else { "Requested shutdown of" })),
        Err(e) => state.logger.error("vm-stop", &format!("VM {id}: {}", e.message)),
    }
    result
}

#[tauri::command]
pub async fn pause_vm(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.provider.pause_vm(&id).await
}

#[tauri::command]
pub async fn resume_vm(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.provider.resume_vm(&id).await
}

#[tauri::command]
pub async fn restart_vm(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.provider.reset_vm(&id).await
}

#[tauri::command]
pub async fn send_ctrl_alt_del(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.provider.send_ctrl_alt_del(&id).await
}

#[tauri::command]
pub async fn vm_live_stats(state: State<'_, AppState>, id: String) -> AppResult<Option<VmLiveStats>> {
    Ok(state.provider.live_stats(&id).await)
}

/// How to reach the running VM's display (VNC-over-WebSocket host/port) -
/// polled by `VmDisplay.tsx` after starting a VM, since the port is only
/// known once QEMU has actually launched.
#[tauri::command]
pub async fn vm_display_info(state: State<'_, AppState>, id: String) -> AppResult<Option<VmDisplayInfo>> {
    Ok(state.provider.display_info(&id).await)
}

#[tauri::command]
pub async fn delete_vm(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let vm_dir = vms::find_vm_dir(&state.vm_root(&app)?, &id)?;
    if state.provider.status(&id).await != VmRuntimeStatus::Stopped {
        return Err(AppError::msg("Stop the virtual machine before deleting it."));
    }
    let config = vms::read_vm(&vm_dir)?;
    vms::delete_vm_folder(&vm_dir)?;
    state.logger.info("vm-delete", &format!("Deleted \"{}\"", config.name));
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateVmInput {
    pub name: Option<String>,
    pub cpu_cores: Option<u32>,
    pub ram_mb: Option<u32>,
    pub network_mode: Option<String>,
    /// "uefi" | "bios". Changing this doesn't touch any UEFI VARS file that
    /// may already exist on disk - switching back to UEFI later reuses it,
    /// so settings made before an accidental switch to BIOS aren't lost.
    pub firmware: Option<String>,
}

#[tauri::command]
pub async fn update_vm(app: AppHandle, state: State<'_, AppState>, id: String, patch: UpdateVmInput) -> AppResult<VmSummary> {
    let vm_dir = vms::find_vm_dir(&state.vm_root(&app)?, &id)?;
    if state.provider.status(&id).await != VmRuntimeStatus::Stopped {
        return Err(AppError::msg("Stop the virtual machine before changing its settings."));
    }
    let mut config = vms::read_vm(&vm_dir)?;
    if let Some(name) = patch.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::invalid("Give the virtual machine a name."));
        }
        config.name = name;
    }
    let next_cpu = patch.cpu_cores.unwrap_or(config.cpu_cores);
    let next_ram = patch.ram_mb.unwrap_or(config.ram_mb);
    validate_hardware(next_cpu, next_ram, config.disk_gb)?;
    config.cpu_cores = next_cpu;
    config.ram_mb = next_ram;
    if let Some(mode) = patch.network_mode {
        if !["nat", "bridged", "offline"].contains(&mode.as_str()) {
            return Err(AppError::invalid("Unknown network mode."));
        }
        config.network_mode = mode;
    }
    if let Some(firmware) = patch.firmware {
        if !["uefi", "bios"].contains(&firmware.as_str()) {
            return Err(AppError::invalid("Unknown firmware mode."));
        }
        config.firmware = firmware;
    }
    vms::write_vm_config(&vm_dir, &config)?;
    Ok(summarize(&state.provider, config, &vm_dir).await)
}

// -- snapshots ------------------------------------------------------------

#[tauri::command]
pub async fn list_snapshots(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<Vec<SnapshotInfo>> {
    let vm_dir = vms::find_vm_dir(&state.vm_root(&app)?, &id)?;
    Ok(vms::list_snapshots(&vm_dir))
}

#[tauri::command]
pub async fn create_snapshot(app: AppHandle, state: State<'_, AppState>, id: String, name: String, description: Option<String>) -> AppResult<SnapshotInfo> {
    let vm_dir = vms::find_vm_dir(&state.vm_root(&app)?, &id)?;
    if state.provider.status(&id).await != VmRuntimeStatus::Stopped {
        return Err(AppError::msg("Stop the virtual machine before creating a snapshot."));
    }
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::invalid("Give the snapshot a name."));
    }
    let snap = state.provider.create_snapshot(&vm_dir, &name, description).await?;
    state.logger.info("snapshot", &format!("Created snapshot \"{}\" for VM {id}", snap.name));
    Ok(snap)
}

#[tauri::command]
pub async fn restore_snapshot(app: AppHandle, state: State<'_, AppState>, id: String, snapshot_id: String) -> AppResult<()> {
    let vm_dir = vms::find_vm_dir(&state.vm_root(&app)?, &id)?;
    if state.provider.status(&id).await != VmRuntimeStatus::Stopped {
        return Err(AppError::msg("Stop the virtual machine before restoring a snapshot."));
    }
    let snap = vms::find_snapshot(&vm_dir, &snapshot_id)?;
    state.provider.restore_snapshot(&vm_dir, &snap).await?;
    state.logger.info("snapshot", &format!("Restored snapshot \"{}\" for VM {id}", snap.name));
    Ok(())
}

#[tauri::command]
pub async fn delete_snapshot(app: AppHandle, state: State<'_, AppState>, id: String, snapshot_id: String) -> AppResult<()> {
    let vm_dir = vms::find_vm_dir(&state.vm_root(&app)?, &id)?;
    if state.provider.status(&id).await != VmRuntimeStatus::Stopped {
        return Err(AppError::msg("Stop the virtual machine before deleting a snapshot."));
    }
    let snap = vms::find_snapshot(&vm_dir, &snapshot_id)?;
    state.provider.delete_snapshot(&vm_dir, &snap).await?;
    state.logger.info("snapshot", &format!("Deleted snapshot \"{}\" for VM {id}", snap.name));
    Ok(())
}

// -- wizard helpers ---------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticHardware {
    pub cpu_cores: u32,
    pub ram_mb: u32,
    pub max_cpu_cores: u32,
    pub max_ram_mb: u64,
}

#[tauri::command]
pub fn automatic_hardware(preset_cpu: u32, preset_ram_mb: u32) -> AppResult<AutomaticHardware> {
    let host = system_info::host_facts()?;
    let budget = HostBudget { logical_cores: host.cpu_cores_logical, total_ram_mb: host.ram_total_mb };
    let limits = virtualization::safe_limits(&budget);
    let (cpu_cores, ram_mb) = virtualization::recommend_automatic(&budget, preset_cpu, preset_ram_mb);
    Ok(AutomaticHardware { cpu_cores, ram_mb, max_cpu_cores: limits.max_cpu_cores, max_ram_mb: limits.max_ram_mb })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedIso {
    pub file_name: String,
    pub size_bytes: u64,
    pub os_family_guess: Option<String>,
    pub preset_guess: Option<String>,
    pub label_guess: Option<String>,
}

#[tauri::command]
pub fn detect_iso(path: String) -> AppResult<DetectedIso> {
    let p = Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|_| AppError::invalid("That file could not be read."))?;
    if meta.len() == 0 {
        return Err(AppError::invalid("That file is empty."));
    }
    let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("selected.iso").to_string();
    let label = iso_detect::read_volume_label(p);
    let (os_family_guess, preset_guess) = iso_detect::guess_os(&file_name, label.as_deref());
    Ok(DetectedIso { file_name, size_bytes: meta.len(), os_family_guess, preset_guess, label_guess: label })
}

