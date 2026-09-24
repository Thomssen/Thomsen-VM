//! VM config storage: pure file operations on `<vm-folder>/config.json`.
//!
//! Deliberately stateless and uncached - each call reads fresh from disk.
//! VM folders are few, user-triggered, and can be large (disk images), so
//! there is no hot path here that would benefit from an in-memory cache, and
//! a cache would risk drifting from a folder a user renamed/removed by hand.
//! Runtime status (running/paused) is *not* stored here - see
//! `virtualization::runtime`.

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::store::models::{SnapshotInfo, VmConfig};
use crate::store::paths;

/// Scan `vm_root` for `*/config.json` and return every VM found. A folder
/// that fails to parse is skipped with a warning rather than failing the
/// whole list - one corrupt VM should never hide every other VM.
pub fn list_vms(vm_root: &Path) -> (Vec<(VmConfig, PathBuf)>, Vec<String>) {
    let mut vms = Vec::new();
    let mut warnings = Vec::new();

    let Ok(entries) = std::fs::read_dir(vm_root) else {
        return (vms, warnings);
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let config_path = paths::vm_config_file(&dir);
        if !config_path.exists() {
            continue;
        }
        match read_vm(&dir) {
            Ok(cfg) => vms.push((cfg, dir)),
            Err(e) => warnings.push(format!(
                "{} could not be read ({e})",
                dir.file_name().and_then(|n| n.to_str()).unwrap_or("a VM folder")
            )),
        }
    }
    vms.sort_by(|a, b| a.0.name.to_lowercase().cmp(&b.0.name.to_lowercase()));
    (vms, warnings)
}

pub fn read_vm(vm_dir: &Path) -> AppResult<VmConfig> {
    let path = paths::vm_config_file(vm_dir);
    let text = std::fs::read_to_string(&path)?;
    let cfg: VmConfig = serde_json::from_str(&text)?;
    Ok(cfg)
}

pub fn write_vm_config(vm_dir: &Path, config: &VmConfig) -> AppResult<()> {
    let bytes = serde_json::to_vec_pretty(config)?;
    paths::atomic_write(&paths::vm_config_file(vm_dir), &bytes)
}

/// Locate a VM's folder by id. VM ids, not folder names, are the stable
/// identity the frontend and runtime registry key on - the folder name is
/// only a human-friendly slug and could in principle be renamed by hand.
pub fn find_vm_dir(vm_root: &Path, id: &str) -> AppResult<PathBuf> {
    let (vms, _) = list_vms(vm_root);
    vms.into_iter()
        .find(|(cfg, _)| cfg.id == id)
        .map(|(_, dir)| dir)
        .ok_or_else(|| AppError::not_found("That virtual machine no longer exists."))
}

/// Create `<vm_root>/<slug>/{disk,snapshots,logs}` and write `config.json`.
/// Does not create the disk image itself - that is backend-specific (see
/// `virtualization::VirtualMachineProvider::create_vm`).
pub fn create_vm_folder(vm_root: &Path, config: &VmConfig) -> AppResult<PathBuf> {
    std::fs::create_dir_all(vm_root)?;
    let slug = paths::vm_slug(&config.name, &config.id);
    let dir = vm_root.join(&slug);
    if dir.exists() {
        return Err(AppError::msg("A VM folder with that name already exists."));
    }
    std::fs::create_dir_all(paths::vm_disk_dir(&dir))?;
    std::fs::create_dir_all(paths::vm_snapshots_dir(&dir))?;
    std::fs::create_dir_all(paths::vm_logs_dir(&dir))?;
    write_vm_config(&dir, config)?;
    Ok(dir)
}

/// Permanently remove a VM's entire folder, including its disk image. Only
/// ever called after the frontend has shown an explicit confirmation.
pub fn delete_vm_folder(vm_dir: &Path) -> AppResult<()> {
    std::fs::remove_dir_all(vm_dir).map_err(|e| AppError::msg("Could not delete the VM folder.").technical(e.to_string()))
}

pub fn disk_used_bytes(vm_dir: &Path) -> Option<u64> {
    std::fs::metadata(paths::vm_disk_file(vm_dir)).ok().map(|m| m.len())
}

// -- snapshots ----------------------------------------------------------

pub fn list_snapshots(vm_dir: &Path) -> Vec<SnapshotInfo> {
    let dir = paths::vm_snapshots_dir(vm_dir);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<SnapshotInfo> = entries
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|s| serde_json::from_str::<SnapshotInfo>(&s).ok())
        .collect();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    out
}

pub fn write_snapshot_meta(vm_dir: &Path, snapshot: &SnapshotInfo) -> AppResult<()> {
    let bytes = serde_json::to_vec_pretty(snapshot)?;
    paths::atomic_write(&paths::vm_snapshot_file(vm_dir, &snapshot.id), &bytes)
}

pub fn delete_snapshot_meta(vm_dir: &Path, snapshot_id: &str) -> AppResult<()> {
    let path = paths::vm_snapshot_file(vm_dir, snapshot_id);
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

pub fn find_snapshot(vm_dir: &Path, snapshot_id: &str) -> AppResult<SnapshotInfo> {
    list_snapshots(vm_dir)
        .into_iter()
        .find(|s| s.id == snapshot_id)
        .ok_or_else(|| AppError::not_found("That snapshot no longer exists."))
}
