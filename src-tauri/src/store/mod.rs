//! The on-disk settings store. VM configs are *not* cached here - each VM's
//! `config.json` lives inside its own folder and is read fresh on demand (see
//! `vms.rs`), since VM folders can be large, few in number, and are only
//! touched on explicit user actions rather than a hot path.

pub mod models;
pub mod paths;

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use models::Settings;

pub struct Store {
    root: PathBuf,
    settings: Settings,
    /// Non-fatal problems found while loading the store - surfaced once in the UI.
    pub load_warnings: Vec<String>,
}

impl Store {
    pub fn empty(root: PathBuf) -> Self {
        Store { root, settings: Settings::default(), load_warnings: Vec::new() }
    }

    pub fn load(root: PathBuf) -> Self {
        let mut store = Store::empty(root);

        let settings_path = paths::settings_file(&store.root);
        if settings_path.exists() {
            match std::fs::read_to_string(&settings_path)
                .map_err(AppError::from)
                .and_then(|s| serde_json::from_str::<Settings>(&s).map_err(AppError::from))
            {
                Ok(s) => store.settings = s,
                Err(e) => store
                    .load_warnings
                    .push(format!("settings.json could not be read ({e}); using defaults")),
            }
        }

        store
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn settings(&self) -> Settings {
        self.settings.clone()
    }

    pub fn save_settings(&mut self, mut next: Settings) -> AppResult<Settings> {
        next.username = next.username.trim().chars().take(60).collect();
        next.default_cpu_cores = next.default_cpu_cores.clamp(1, 64);
        next.default_ram_mb = next.default_ram_mb.clamp(256, 1024 * 1024);
        next.default_disk_gb = next.default_disk_gb.clamp(1, 4000);
        if !["nat", "bridged", "offline"].contains(&next.default_network_mode.as_str()) {
            next.default_network_mode = "nat".into();
        }
        if !["dark", "light", "system"].contains(&next.theme.as_str()) {
            next.theme = "dark".into();
        }
        if !["fit", "stretch", "native"].contains(&next.scaling_mode.as_str()) {
            next.scaling_mode = "fit".into();
        }
        self.settings = next;
        self.persist_settings()?;
        Ok(self.settings.clone())
    }

    pub fn reset_settings(&mut self) -> AppResult<Settings> {
        self.settings = Settings::default();
        self.persist_settings()?;
        Ok(self.settings.clone())
    }

    fn persist_settings(&self) -> AppResult<()> {
        let bytes = serde_json::to_vec_pretty(&self.settings)?;
        paths::atomic_write(&paths::settings_file(&self.root), &bytes)
    }
}

pub fn uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
