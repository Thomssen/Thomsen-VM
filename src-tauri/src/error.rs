//! One error type for the whole backend, structured so the UI can always
//! show a plain-language message first and technical detail only behind a
//! "View Details" disclosure - never a raw stack trace by default.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    /// Plain-language summary, always safe to show directly.
    pub message: String,
    /// Why it happened, in user terms (e.g. "Hardware virtualization is disabled.").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// What the user can do about it (e.g. "Enable Intel VT-x or AMD-V in BIOS/UEFI.").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_fix: Option<String>,
    /// Raw technical detail (command output, error debug text) - only ever
    /// shown behind an explicit "View Details" click.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub technical: Option<String>,
}

impl AppError {
    pub fn msg(s: impl Into<String>) -> Self {
        AppError { message: s.into(), reason: None, suggested_fix: None, technical: None }
    }

    pub fn invalid(s: impl Into<String>) -> Self {
        AppError::msg(s)
    }

    pub fn not_found(s: impl Into<String>) -> Self {
        AppError::msg(s)
    }

    /// The full "Reason / Suggested fix / View Details" shape the spec asks
    /// for on operational failures (VM start/stop, backend errors).
    pub fn with_fix(message: impl Into<String>, reason: impl Into<String>, suggested_fix: impl Into<String>) -> Self {
        AppError { message: message.into(), reason: Some(reason.into()), suggested_fix: Some(suggested_fix.into()), technical: None }
    }

    pub fn technical(mut self, detail: impl Into<String>) -> Self {
        self.technical = Some(detail.into());
        self
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::msg("A file operation failed.").technical(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::msg("Saved data could not be read.").technical(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
