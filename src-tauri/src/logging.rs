//! Local, plain-text logging for VM lifecycle events and backend errors.
//!
//! Deliberately simple: one append-only file, one line per event, flushed
//! immediately (these are infrequent lifecycle events, not a hot path, so the
//! extra safety against losing the last lines on a crash is worth it). Never
//! logs VM contents, ISO paths' file contents, or credentials - only the
//! event, the VM name/id, and (for errors) the technical detail already
//! shown behind "View Details" in the UI.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::store::paths;

pub struct Logger {
    path: PathBuf,
    file: Mutex<()>,
}

impl Logger {
    pub fn new(data_root: &Path) -> Self {
        let dir = paths::app_logs_dir(data_root);
        let _ = std::fs::create_dir_all(&dir);
        Logger { path: paths::app_log_file(data_root), file: Mutex::new(()) }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn write_line(&self, line: &str) {
        let _guard = self.file.lock().unwrap();
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&self.path) {
            let _ = writeln!(f, "{line}");
        }
    }

    fn log(&self, level: &str, category: &str, message: &str) {
        let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        self.write_line(&format!("[{ts}] {level:<5} {category:<10} {message}"));
    }

    pub fn info(&self, category: &str, message: &str) {
        self.log("INFO", category, message);
    }
    pub fn warn(&self, category: &str, message: &str) {
        self.log("WARN", category, message);
    }
    pub fn error(&self, category: &str, message: &str) {
        self.log("ERROR", category, message);
    }
}
