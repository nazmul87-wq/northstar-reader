use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

use tauri::{AppHandle, Manager};

use crate::{
    error::{state_error, AppError, AppResult},
    models::{RecentVault, VaultContext},
    state::AppState,
};

const RECENTS_FILE_NAME: &str = "recent-vaults.json";
const MAX_RECENTS: usize = 12;

pub fn bootstrap(app: &AppHandle, state: &AppState) -> AppResult<()> {
    let recents = load_from_disk(app).unwrap_or_default();
    let mut guard = state.recents.write().map_err(|_| state_error("recents"))?;
    *guard = recents;
    Ok(())
}

pub fn list(state: &AppState) -> AppResult<Vec<RecentVault>> {
    let guard = state.recents.read().map_err(|_| state_error("recents"))?;
    Ok(guard.clone())
}

pub fn remember(app: &AppHandle, state: &AppState, vault: &VaultContext) -> AppResult<()> {
    let mut guard = state.recents.write().map_err(|_| state_error("recents"))?;
    guard.retain(|entry| entry.root_path != vault.root_path);
    guard.insert(
        0,
        RecentVault {
            name: vault.name.clone(),
            root_path: vault.root_path.clone(),
            last_opened_ms: epoch_ms(),
        },
    );
    guard.truncate(MAX_RECENTS);
    persist(app, &guard)
}

pub fn remove(app: &AppHandle, state: &AppState, root_path: &str) -> AppResult<Vec<RecentVault>> {
    let mut guard = state.recents.write().map_err(|_| state_error("recents"))?;
    guard.retain(|entry| entry.root_path != root_path);
    persist(app, &guard)?;
    Ok(guard.clone())
}

fn persist(app: &AppHandle, recents: &[RecentVault]) -> AppResult<()> {
    let file_path = recents_file_path(app)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let payload = serde_json::to_vec_pretty(recents)?;
    fs::write(file_path, payload)?;
    Ok(())
}

fn load_from_disk(app: &AppHandle) -> AppResult<Vec<RecentVault>> {
    let file_path = recents_file_path(app)?;
    if !file_path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read(file_path)?;
    Ok(serde_json::from_slice(&raw)?)
}

fn recents_file_path(app: &AppHandle) -> AppResult<PathBuf> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Tauri(error.to_string()))?;
    Ok(app_dir.join(RECENTS_FILE_NAME))
}

fn epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
