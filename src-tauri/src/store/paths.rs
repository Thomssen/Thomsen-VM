//! Where the app keeps its data on disk.
//!
//! ```text
//! %APPDATA%\Thomsen VM\
//!   settings.json
//!   logs\thomsen-vm.log
//!
//! Documents\Thomsen VM\VirtualMachines\      (default - overridable in Settings)
//!   <vm-slug>\
//!     config.json
//!     disk\disk.qcow2
//!     snapshots\<snapshot-id>.json
//!     logs\vm.log
//! ```

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub const DATA_DIR_NAME: &str = "Thomsen VM";

/// `%APPDATA%\Thomsen VM` (Roaming). Created if missing.
pub fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let base = app
        .path()
        .data_dir()
        .map_err(|e| AppError::msg(format!("cannot resolve %APPDATA%: {e}")))?;
    let dir = base.join(DATA_DIR_NAME);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn settings_file(root: &Path) -> PathBuf {
    root.join("settings.json")
}

pub fn app_logs_dir(root: &Path) -> PathBuf {
    root.join("logs")
}

pub fn app_log_file(root: &Path) -> PathBuf {
    app_logs_dir(root).join("thomsen-vm.log")
}

/// Failed app-lock attempt tracking - kept separate from `settings.json`
/// since it's internal backend state, never something the frontend reads or
/// writes directly as a setting.
pub fn lock_attempts_file(root: &Path) -> PathBuf {
    root.join("lock_attempts.json")
}

/// `Documents\Thomsen VM\VirtualMachines` - the out-of-the-box VM folder,
/// used whenever `Settings.default_vm_folder` is `None`.
pub fn default_vm_root(app: &AppHandle) -> AppResult<PathBuf> {
    let docs = app
        .path()
        .document_dir()
        .map_err(|e| AppError::msg(format!("cannot resolve Documents folder: {e}")))?;
    Ok(docs.join("Thomsen VM").join("VirtualMachines"))
}

pub fn vm_config_file(vm_dir: &Path) -> PathBuf {
    vm_dir.join("config.json")
}

pub fn vm_disk_dir(vm_dir: &Path) -> PathBuf {
    vm_dir.join("disk")
}

pub fn vm_disk_file(vm_dir: &Path) -> PathBuf {
    vm_disk_dir(vm_dir).join("disk.qcow2")
}

pub fn vm_snapshots_dir(vm_dir: &Path) -> PathBuf {
    vm_dir.join("snapshots")
}

pub fn vm_snapshot_file(vm_dir: &Path, snapshot_id: &str) -> PathBuf {
    vm_snapshots_dir(vm_dir).join(format!("{snapshot_id}.json"))
}

pub fn vm_logs_dir(vm_dir: &Path) -> PathBuf {
    vm_dir.join("logs")
}

pub fn vm_log_file(vm_dir: &Path) -> PathBuf {
    vm_logs_dir(vm_dir).join("vm.log")
}

/// Records the PID of the QEMU process currently running this VM, if any -
/// checked by `qemu.rs::start_vm` so a VM already running under a *different*
/// Thomsen VM process (e.g. a previous session that exited without cleanly
/// killing its QEMU child) is detected and refused, instead of a second QEMU
/// instance being spawned against the same disk image. Purely advisory: a
/// stale file (naming a PID that's no longer alive, or alive as something
/// else entirely) is silently overwritten on the next start - nothing ever
/// reads it besides that one check.
pub fn vm_run_lock_file(vm_dir: &Path) -> PathBuf {
    vm_dir.join("run.lock")
}

/// This VM's own writable UEFI NVRAM store - a per-VM copy of the firmware's
/// blank-vars template (see `qemu.rs::locate_uefi_firmware`), never the
/// template itself, so each VM's UEFI settings (boot order, Secure Boot
/// state, etc.) persist independently. Only meaningful when
/// `VmConfig.firmware == "uefi"`; harmless and unused otherwise.
pub fn vm_uefi_vars_file(vm_dir: &Path) -> PathBuf {
    vm_dir.join("OVMF_VARS.fd")
}

/// A filesystem-safe folder name derived from the VM's display name (e.g.
/// "Kali Lab" -> "Kali-Lab"), with a short id suffix to guarantee uniqueness
/// even when two VMs share a name.
pub fn vm_slug(name: &str, id: &str) -> String {
    let mut slug: String = name
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    let slug = slug.trim_matches('-');
    let short_id = &id[..8.min(id.len())];
    if slug.is_empty() {
        format!("vm-{short_id}")
    } else {
        format!("{slug}-{short_id}")
    }
}

/// Write `bytes` to `path` atomically: write a sibling `.tmp` then rename over
/// the target. `std::fs::rename` replaces an existing file on Windows.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vm_slug_sanitizes_spaces_and_punctuation() {
        assert_eq!(vm_slug("Kali Lab", "abcdef1234567890"), "Kali-Lab-abcdef12");
    }

    #[test]
    fn vm_slug_collapses_runs_of_separators() {
        // "Windows 11: Test!!" - colon, space, and repeated punctuation must
        // collapse to single hyphens, not "Windows-11---Test--".
        assert_eq!(vm_slug("Windows 11: Test!!", "1234567890"), "Windows-11-Test-12345678");
    }

    #[test]
    fn vm_slug_falls_back_to_a_generic_name_when_nothing_alphanumeric_survives() {
        assert_eq!(vm_slug("!!!", "1234567890"), "vm-12345678");
        assert_eq!(vm_slug("   ", "1234567890"), "vm-12345678");
    }

    #[test]
    fn vm_slug_never_panics_on_a_short_id() {
        // An id shorter than 8 chars must not panic on the slice.
        assert_eq!(vm_slug("Test", "ab"), "Test-ab");
    }
}
