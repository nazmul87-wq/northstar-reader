use tauri::{AppHandle, State};

use crate::{models::{RecentVault, VaultContext}, services, state::AppState};

#[tauri::command]
pub fn open_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<VaultContext, String> {
    services::vaults::open_vault(&app, state.inner(), &path).map_err(Into::into)
}

#[tauri::command]
pub fn create_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<VaultContext, String> {
    services::vaults::create_vault(&app, state.inner(), &path, name).map_err(Into::into)
}

#[tauri::command]
pub fn current_vault(state: State<'_, AppState>) -> Result<Option<VaultContext>, String> {
    services::vaults::current_vault_opt(state.inner()).map_err(Into::into)
}

#[tauri::command]
pub fn list_recent_vaults(state: State<'_, AppState>) -> Result<Vec<RecentVault>, String> {
    services::recents::list(state.inner()).map_err(Into::into)
}

#[tauri::command]
pub fn remove_recent_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<RecentVault>, String> {
    services::recents::remove(&app, state.inner(), &path).map_err(Into::into)
}
