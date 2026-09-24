//! Small shared helpers.

/// Current UTC time as RFC 3339, the timestamp format used everywhere in the
/// persisted models (`createdAt`, `lastStartedAt`, ...).
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
