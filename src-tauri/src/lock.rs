//! Optional local app-lock password: Argon2id hashing, salt generation, and
//! a persisted, escalating throttle against rapid-fire guessing. Nothing
//! here ever touches the network; the raw password is never logged, never
//! written to `settings.json`, and never returned to the frontend.
//!
//! The password hash lives in the Windows Credential Manager via the
//! `keyring` crate (service `"Thomsen VM"`, account `"app-lock"`) - "enabled"
//! is derived from whether that credential exists, never a separate stored
//! flag, so there is no way for an "enabled" flag to desync from reality.
//!
//! Failed-attempt state is persisted to `lock_attempts.json` rather than
//! kept only in memory: the schedule below already caps the wait at 60
//! seconds, so the legitimate owner never needs a restart to escape it - the
//! only party a restart-clears-it design would help is someone who doesn't
//! know the password, since closing and reopening the app takes no
//! sophistication at all. Keyed on wall-clock time (`chrono::Utc::now()`),
//! not `std::time::Instant`, which has no defined epoch and cannot survive a
//! process restart.

use std::path::Path;
use std::time::Duration;

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::store::paths;

const SERVICE: &str = "Thomsen VM";
const ACCOUNT: &str = "app-lock";
const MIN_PASSWORD_LEN: usize = 6;

// ---------------------------------------------------------------------------
// Storage (Credential Manager)
// ---------------------------------------------------------------------------

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

fn stored_hash() -> Option<String> {
    match entry().ok()?.get_password() {
        Ok(v) if !v.trim().is_empty() => Some(v),
        _ => None,
    }
}

pub fn has_password() -> bool {
    stored_hash().is_some()
}

fn store_hash(phc: &str) -> AppResult<()> {
    entry()
        .and_then(|e| e.set_password(phc).map_err(|e| e.to_string()))
        .map_err(|e| AppError::msg(format!("Could not save the password: {e}")))
}

pub fn clear_password() -> AppResult<()> {
    let entry = entry().map_err(|e| AppError::msg(format!("Could not remove the password: {e}")))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::msg(format!("Could not remove the password: {e}"))),
    }
}

// ---------------------------------------------------------------------------
// Argon2id
// ---------------------------------------------------------------------------

fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::msg(format!("Could not hash the password: {e}")))
}

/// `false` for *any* failure - a malformed stored hash and a wrong password
/// both mean "cannot verify," and the safe default for "cannot verify" is
/// "deny," not "allow." Never reveals which case it was.
fn verify(password: &str, phc: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(phc) else { return false };
    Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
}

/// Creates the password for the first time (or after it's been disabled, or
/// to overwrite it on a change). Server-side length check - the frontend
/// validates too, but a security boundary shouldn't rely solely on
/// client-side validation.
pub fn create_password(password: &str) -> AppResult<()> {
    if password.chars().count() < MIN_PASSWORD_LEN {
        return Err(AppError::invalid(format!("Password must be at least {MIN_PASSWORD_LEN} characters.")));
    }
    let phc = hash_password(password)?;
    store_hash(&phc)
}

// ---------------------------------------------------------------------------
// Failed-attempt throttling
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
struct LockAttempts {
    failures: u32,
    /// Unix milliseconds. `None` = no active cooldown.
    cooldown_until_ms: Option<i64>,
}

pub struct LockAttemptsState(std::sync::Mutex<LockAttempts>);

impl LockAttemptsState {
    pub fn load(root: &Path) -> Self {
        Self(std::sync::Mutex::new(load_attempts(root)))
    }
}

fn load_attempts(root: &Path) -> LockAttempts {
    let path = paths::lock_attempts_file(root);
    if !path.exists() {
        return LockAttempts::default();
    }
    // A missing or corrupt file fails open toward the owner (zero failures,
    // no cooldown) - exactly how `Store::load` already treats a bad
    // `settings.json`, not treated as an error worth surfacing.
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_attempts(root: &Path, attempts: &LockAttempts) -> AppResult<()> {
    let bytes = serde_json::to_vec_pretty(attempts)?;
    paths::atomic_write(&paths::lock_attempts_file(root), &bytes)
}

/// 3 free attempts, then an escalating, capped delay. Never unbounded - the
/// real owner is never permanently locked out, just slowed down.
fn cooldown_for(failures: u32) -> Option<Duration> {
    match failures {
        0..=3 => None,
        4 => Some(Duration::from_secs(5)),
        5 => Some(Duration::from_secs(15)),
        6 => Some(Duration::from_secs(30)),
        _ => Some(Duration::from_secs(60)),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckOutcome {
    pub ok: bool,
    pub message: String,
    pub retry_after_secs: Option<u32>,
}

fn remaining_secs(cooldown_until_ms: i64, now_ms: i64) -> Option<u32> {
    let remaining_ms = cooldown_until_ms - now_ms;
    if remaining_ms <= 0 {
        None
    } else {
        Some((remaining_ms as u64).div_ceil(1000) as u32)
    }
}

/// The single guard every password check funnels through - the lock screen
/// and the "confirm current password" step inside change/disable all share
/// one counter, so there is exactly one place the throttle logic can be
/// wrong instead of three that must be kept in sync by hand.
pub fn check_password(root: &Path, state: &LockAttemptsState, password: &str) -> AppResult<CheckOutcome> {
    let Some(phc) = stored_hash() else {
        return Err(AppError::invalid("No app password is set."));
    };

    let mut attempts = state.0.lock().unwrap();
    let now_ms = Utc::now().timestamp_millis();

    // Already in a cooldown: reject immediately, without touching Argon2 and
    // without advancing the counter. If a guess-during-cooldown could still
    // succeed, the cooldown would just become a "wrong-answer tax" rather
    // than a real rate limit; if it could still fail and count, mashing
    // Unlock during the wait would ratchet the delay up for free.
    if let Some(until) = attempts.cooldown_until_ms {
        if let Some(secs) = remaining_secs(until, now_ms) {
            return Ok(CheckOutcome {
                ok: false,
                message: format!("Too many attempts. Try again in {secs}s."),
                retry_after_secs: Some(secs),
            });
        }
    }

    if verify(password, &phc) {
        *attempts = LockAttempts::default();
        save_attempts(root, &attempts)?;
        return Ok(CheckOutcome { ok: true, message: String::new(), retry_after_secs: None });
    }

    attempts.failures += 1;
    let cooldown = cooldown_for(attempts.failures);
    attempts.cooldown_until_ms = cooldown.map(|d| now_ms + d.as_millis() as i64);
    save_attempts(root, &attempts)?;

    Ok(CheckOutcome {
        ok: false,
        message: "Incorrect password.".to_string(),
        retry_after_secs: cooldown.map(|d| d.as_secs() as u32),
    })
}

/// Read-only status for the lock screen to show a live countdown on mount,
/// in case a cooldown is already active from before a relaunch.
pub fn lock_status(state: &LockAttemptsState) -> Option<u32> {
    let attempts = state.0.lock().unwrap();
    let until = attempts.cooldown_until_ms?;
    remaining_secs(until, Utc::now().timestamp_millis())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("thomsen-vm-lock-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // These tests exercise the throttle state machine directly against
    // `LockAttempts`/`cooldown_for`, without touching the real Credential
    // Manager.

    #[test]
    fn first_three_failures_are_free() {
        let mut attempts = LockAttempts::default();
        for _ in 0..3 {
            attempts.failures += 1;
            assert_eq!(cooldown_for(attempts.failures), None, "failure {} should not trigger a cooldown", attempts.failures);
        }
    }

    #[test]
    fn fourth_failure_onward_escalates_and_caps() {
        let schedule = [5, 15, 30, 60, 60, 60];
        let mut attempts = LockAttempts { failures: 3, cooldown_until_ms: None };
        for expected_secs in schedule {
            attempts.failures += 1;
            let cooldown = cooldown_for(attempts.failures).expect("should be in cooldown past 3 failures");
            assert_eq!(cooldown, Duration::from_secs(expected_secs));
        }
    }

    #[test]
    fn remaining_secs_rounds_up_and_expires_cleanly() {
        assert_eq!(remaining_secs(10_500, 9_000), Some(2)); // 1.5s left -> rounds up to 2
        assert_eq!(remaining_secs(10_000, 10_000), None); // exactly now -> expired
        assert_eq!(remaining_secs(9_000, 10_000), None); // already past -> expired
    }

    #[test]
    fn attempts_persist_and_reload_across_a_simulated_restart() {
        let root = temp_root();
        let saved = LockAttempts { failures: 4, cooldown_until_ms: Some(123_456) };
        save_attempts(&root, &saved).unwrap();

        let reloaded = load_attempts(&root);
        assert_eq!(reloaded.failures, 4);
        assert_eq!(reloaded.cooldown_until_ms, Some(123_456));

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn missing_or_corrupt_attempts_file_fails_open() {
        let root = temp_root();
        assert_eq!(load_attempts(&root).failures, 0);

        std::fs::write(paths::lock_attempts_file(&root), b"not valid json").unwrap();
        let loaded = load_attempts(&root);
        assert_eq!(loaded.failures, 0);
        assert_eq!(loaded.cooldown_until_ms, None);

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn create_password_rejects_too_short_a_password() {
        let err = create_password("abc");
        assert!(err.is_err());
    }

    /// Real end-to-end test against the actual Windows Credential Manager
    /// (not a mock) - the one thing the pure state-machine tests above
    /// deliberately don't cover. Skips itself if a real password already
    /// exists (e.g. the user completed onboarding for real) rather than
    /// clobbering it, and always restores the "no password" state
    /// afterward via `clear_password`, matching the disposable-resource
    /// pattern the QEMU integration test uses.
    #[test]
    fn real_argon2_and_credential_manager_round_trip() {
        if has_password() {
            eprintln!("SKIPPED: a real app password already exists on this machine - not touching it.");
            return;
        }

        create_password("correct-horse-battery").expect("hashing + storing to Credential Manager should succeed");
        assert!(has_password());

        let root = temp_root();
        let state = LockAttemptsState::load(&root);

        let wrong = check_password(&root, &state, "wrong-password").expect("check should not error");
        assert!(!wrong.ok, "an incorrect password must not verify");

        let right = check_password(&root, &state, "correct-horse-battery").expect("check should not error");
        assert!(right.ok, "the real Argon2id hash must verify the password that produced it");

        clear_password().expect("cleanup: clearing the test password should succeed");
        assert!(!has_password(), "cleanup must actually remove the Credential Manager entry");

        std::fs::remove_dir_all(root).ok();
    }
}
