//! App-lock commands: create/verify/change/disable a local-only password,
//! and report throttle status. The actual hashing and attempt-throttling
//! logic lives in `lock.rs` - these are thin wrappers that extract
//! `AppState` and translate a failed re-auth into the same `AppError`
//! pattern the rest of the command layer already uses.

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::lock::{self, CheckOutcome};
use crate::state::AppState;

#[tauri::command]
pub fn has_password() -> bool {
    lock::has_password()
}

#[tauri::command]
pub fn create_password(password: String) -> AppResult<()> {
    lock::create_password(&password)
}

/// Used directly by the lock screen - a wrong guess or an active cooldown
/// are both normal `Ok` outcomes, not an `Err`. `Err` is reserved for a
/// genuinely exceptional case (no password is set at all, or the credential
/// store itself failed).
#[tauri::command]
pub fn verify_password(state: State<'_, AppState>, password: String) -> AppResult<CheckOutcome> {
    lock::check_password(&state.data_root, &state.lock_attempts, &password)
}

/// Re-authenticates with `current` through the exact same throttled guard as
/// `verify_password` (one counter, not a second independent implementation),
/// then, only on success, hashes and stores `new_password`.
#[tauri::command]
pub fn change_password(state: State<'_, AppState>, current: String, new_password: String) -> AppResult<()> {
    let outcome = lock::check_password(&state.data_root, &state.lock_attempts, &current)?;
    if !outcome.ok {
        return Err(AppError::invalid(outcome.message));
    }
    lock::create_password(&new_password)
}

#[tauri::command]
pub fn disable_password(state: State<'_, AppState>, current: String) -> AppResult<()> {
    let outcome = lock::check_password(&state.data_root, &state.lock_attempts, &current)?;
    if !outcome.ok {
        return Err(AppError::invalid(outcome.message));
    }
    lock::clear_password()
}

/// Lets the lock screen show a live countdown on mount if a cooldown from
/// before a relaunch is still active, rather than the owner only learning
/// about it after submitting a wasted attempt.
#[tauri::command]
pub fn lock_status(state: State<'_, AppState>) -> Option<u32> {
    lock::lock_status(&state.lock_attempts)
}
