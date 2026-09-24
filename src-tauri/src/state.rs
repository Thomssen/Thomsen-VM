//! Process-wide state handed to every command via `tauri::State`.

use std::path::PathBuf;
use std::sync::Mutex;

use sysinfo::System;
use tauri::AppHandle;

use crate::error::AppResult;
use crate::lock::LockAttemptsState;
use crate::logging::Logger;
use crate::store::Store;
use crate::virtualization::qemu::QemuProvider;

pub struct AppState {
    pub store: Mutex<Store>,
    pub provider: QemuProvider,
    /// Reused across live-usage polls so `sysinfo` can compute real CPU%
    /// deltas instead of a meaningless first sample every time.
    pub host_sampler: Mutex<System>,
    pub logger: Logger,
    /// Persisted app-lock failed-attempt throttle - see `lock.rs`.
    pub lock_attempts: LockAttemptsState,
    pub data_root: PathBuf,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        let data_root = store.root().to_path_buf();
        let logger = Logger::new(&data_root);
        let lock_attempts = LockAttemptsState::load(&data_root);
        AppState { store: Mutex::new(store), provider: QemuProvider::default(), host_sampler: Mutex::new(System::new()), logger, lock_attempts, data_root }
    }

    /// The folder new VMs are created under and existing ones are listed
    /// from: `Settings.default_vm_folder` if the user has set one, otherwise
    /// the out-of-the-box `Documents\Thomsen VM\VirtualMachines`.
    pub fn vm_root(&self, app: &AppHandle) -> AppResult<PathBuf> {
        let configured = self.store.lock().unwrap().settings().default_vm_folder;
        match configured {
            Some(p) if !p.trim().is_empty() => Ok(PathBuf::from(p)),
            _ => crate::store::paths::default_vm_root(app),
        }
    }
}
