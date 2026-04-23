use tauri::{AppHandle, State};

use crate::{models::WatchStatus, services, state::AppState};

#[tauri::command]
pub fn start_vault_watch(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WatchStatus, String> {
    services::watcher::start_for_current_vault(&app, state.inner()).map_err(Into::into)
}

#[tauri::command]
pub fn stop_vault_watch(state: State<'_, AppState>) -> Result<WatchStatus, String> {
    services::watcher::stop(state.inner()).map_err(Into::into)
}

#[tauri::command]
pub fn watch_status(state: State<'_, AppState>) -> Result<WatchStatus, String> {
    services::watcher::status(state.inner()).map_err(Into::into)
}
