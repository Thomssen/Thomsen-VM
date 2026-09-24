//! App identity, host hardware/OS facts, and QEMU backend status.

use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::system_info::{self, HostFacts, LiveUsage, StorageInfo};
use crate::virtualization::{ProviderAvailability, VirtualMachineProvider};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub data_dir: String,
    pub logs_path: String,
    pub load_warnings: Vec<String>,
}

#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> AppInfo {
    let store = state.store.lock().unwrap();
    AppInfo {
        name: "Thomsen VM".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        data_dir: store.root().display().to_string(),
        logs_path: state.logger.path().display().to_string(),
        load_warnings: store.load_warnings.clone(),
    }
}

#[tauri::command]
pub fn get_host_facts() -> AppResult<HostFacts> {
    system_info::host_facts()
}

#[tauri::command]
pub fn get_live_usage(state: State<'_, AppState>) -> LiveUsage {
    let mut sys = state.host_sampler.lock().unwrap();
    system_info::live_usage(&mut sys)
}

#[tauri::command]
pub fn get_storage_info(state: State<'_, AppState>, app: tauri::AppHandle) -> AppResult<Option<StorageInfo>> {
    let vm_root = state.vm_root(&app)?;
    Ok(system_info::storage_for_path(&vm_root))
}

#[tauri::command]
pub fn qemu_status(state: State<'_, AppState>) -> ProviderAvailability {
    state.provider.availability()
}

#[tauri::command]
pub fn recheck_qemu(state: State<'_, AppState>) -> ProviderAvailability {
    state.provider.refresh_detection();
    state.provider.availability()
}

#[tauri::command]
pub fn open_logs_folder(state: State<'_, AppState>) -> AppResult<String> {
    Ok(state.logger.path().parent().map(|p| p.display().to_string()).unwrap_or_default())
}

#[tauri::command]
pub fn default_vm_folder_path(app: tauri::AppHandle) -> AppResult<String> {
    Ok(crate::store::paths::default_vm_root(&app)?.display().to_string())
}
