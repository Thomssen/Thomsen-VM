//! Thomsen VM - application wiring.
//!
//! `main.rs` is a one-liner that calls [`run`]. Keeping the app in a library
//! crate keeps every module testable and matches the Tauri v2 template layout.

pub mod commands;
pub mod error;
pub mod iso_detect;
pub mod lock;
pub mod logging;
pub mod state;
pub mod store;
pub mod system_info;
pub mod util;
pub mod virtualization;
pub mod vms;

use tauri::{LogicalPosition, LogicalSize, Manager};

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin registered: on a second launch attempt,
        // this intercepts it (the second process exits immediately) and
        // runs the callback in the *original* process instead - bring that
        // one to the front rather than silently doing nothing, since the
        // user's intent in double-clicking/relaunching is "show me the app."
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![])))
        .setup(|app| {
            let root = store::paths::data_dir(app.handle()).expect("resolve %APPDATA%\\Thomsen VM");
            let store = store::Store::load(root);
            let settings = store.settings();

            // The window starts hidden (tauri.conf.json) to avoid a white
            // flash while the webview paints. Restore its last placement
            // (only when the user opted in) before revealing it, so there is
            // never a visible jump from the default position to the saved one.
            if let Some(window) = app.get_webview_window("main") {
                if settings.remember_window_position {
                    // Defense in depth against a degenerate saved geometry
                    // (e.g. Windows reports a minimized window's rectangle as
                    // a tiny off-screen box) - the frontend already filters
                    // this before saving, but a value saved before that fix
                    // existed must not be able to open the window unusably
                    // small or off-screen.
                    if let Some(g) = settings.window_geometry {
                        if g.width >= 300 && g.height >= 200 {
                            let _ = window.set_position(LogicalPosition::new(g.x as f64, g.y as f64));
                            let _ = window.set_size(LogicalSize::new(g.width as f64, g.height as f64));
                            if g.maximized {
                                let _ = window.maximize();
                            }
                        }
                    }
                }
                window.show()?;
                let _ = window.set_focus();
            }

            app.manage(AppState::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // system
            commands::app_info,
            commands::get_host_facts,
            commands::get_live_usage,
            commands::get_storage_info,
            commands::qemu_status,
            commands::recheck_qemu,
            commands::open_logs_folder,
            commands::default_vm_folder_path,
            // settings
            commands::get_settings,
            commands::save_settings,
            commands::reset_settings,
            commands::save_window_geometry,
            // security
            commands::has_password,
            commands::create_password,
            commands::verify_password,
            commands::change_password,
            commands::disable_password,
            commands::lock_status,
            // virtual machines
            commands::list_vms,
            commands::get_vm,
            commands::create_vm,
            commands::start_vm,
            commands::stop_vm,
            commands::pause_vm,
            commands::resume_vm,
            commands::restart_vm,
            commands::send_ctrl_alt_del,
            commands::vm_live_stats,
            commands::vm_display_info,
            commands::delete_vm,
            commands::update_vm,
            // snapshots
            commands::list_snapshots,
            commands::create_snapshot,
            commands::restore_snapshot,
            commands::delete_snapshot,
            // create-vm wizard helpers
            commands::automatic_hardware,
            commands::detect_iso,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Thomsen VM");
}
