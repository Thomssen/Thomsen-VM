//! Global app settings: theme/appearance, startup behavior, and VM defaults.

use tauri::State;

#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt;

use crate::error::AppResult;
use crate::state::AppState;
use crate::store::models::{Settings, WindowGeometry};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.store.lock().unwrap().settings()
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, state: State<'_, AppState>, settings: Settings) -> AppResult<Settings> {
    let start_with_windows = settings.start_with_windows;
    let saved = {
        let mut store = state.store.lock().unwrap();
        store.save_settings(settings)?
    };

    #[cfg(desktop)]
    {
        if let Ok(autolaunch) = app.autolaunch().is_enabled() {
            if start_with_windows && !autolaunch {
                let _ = app.autolaunch().enable();
            } else if !start_with_windows && autolaunch {
                let _ = app.autolaunch().disable();
            }
        }
    }
    let _ = app; // silence unused-var warning on non-desktop targets

    Ok(saved)
}

#[tauri::command]
pub fn reset_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    state.store.lock().unwrap().reset_settings()
}

/// Called (debounced) from the frontend on window move/resize so the next
/// launch can restore it - only actually applied at startup when
/// `remember_window_position` is enabled (see `lib.rs`'s `setup`).
#[tauri::command]
pub fn save_window_geometry(state: State<'_, AppState>, geometry: WindowGeometry) -> AppResult<()> {
    let mut store = state.store.lock().unwrap();
    let mut settings = store.settings();
    settings.window_geometry = Some(geometry);
    store.save_settings(settings)?;
    Ok(())
}
