use std::{fs, path::{Path, PathBuf}};

use tauri::AppHandle;

use crate::{
    error::{state_error, AppError, AppResult},
    models::VaultContext,
    services::{indexer, recents, watcher},
    state::AppState,
    util::paths,
};

pub fn open_vault(app: &AppHandle, state: &AppState, path: &str) -> AppResult<VaultContext> {
    let root = paths::canonicalize_vault_root(Path::new(path))?;
    let vault = build_vault_context(root)?;

    indexer::ensure_initialized(&vault)?;
    indexer::reindex_vault(&vault)?;
    set_current_vault(state, vault.clone())?;
    recents::remember(app, state, &vault)?;
    let _ = watcher::start_for_vault(app, state, &vault);

    Ok(vault)
}

pub fn create_vault(
    app: &AppHandle,
    state: &AppState,
    path: &str,
    name: Option<String>,
) -> AppResult<VaultContext> {
    let requested_path = PathBuf::from(path);
    if requested_path.exists() && !requested_path.is_dir() {
        return Err(AppError::InvalidVault(format!(
            "{} exists but is not a directory",
            requested_path.to_string_lossy()
        )));
    }

    fs::create_dir_all(&requested_path)?;
    let root = paths::canonicalize_vault_root(&requested_path)?;
    let vault = build_vault_context(root)?;

    if let Some(custom_name) = name.filter(|value| !value.trim().is_empty()) {
        let mut renamed = vault.clone();
        renamed.name = custom_name.trim().to_string();
        indexer::ensure_initialized(&renamed)?;
        indexer::reindex_vault(&renamed)?;
        set_current_vault(state, renamed.clone())?;
        recents::remember(app, state, &renamed)?;
        let _ = watcher::start_for_vault(app, state, &renamed);
        return Ok(renamed);
    }

    indexer::ensure_initialized(&vault)?;
    indexer::reindex_vault(&vault)?;
    set_current_vault(state, vault.clone())?;
    recents::remember(app, state, &vault)?;
    let _ = watcher::start_for_vault(app, state, &vault);

    Ok(vault)
}

pub fn current_vault(state: &AppState) -> AppResult<VaultContext> {
    current_vault_opt(state)?.ok_or_else(|| AppError::State("no vault is currently open".into()))
}

pub fn current_vault_opt(state: &AppState) -> AppResult<Option<VaultContext>> {
    let guard = state.session.read().map_err(|_| state_error("session"))?;
    Ok(guard.current_vault.clone())
}

fn set_current_vault(state: &AppState, vault: VaultContext) -> AppResult<()> {
    let mut guard = state.session.write().map_err(|_| state_error("session"))?;
    guard.current_vault = Some(vault);
    Ok(())
}

fn build_vault_context(root: PathBuf) -> AppResult<VaultContext> {
    let metadata_path = root.join(paths::VAULT_METADATA_DIR);
    fs::create_dir_all(&metadata_path)?;

    let index_db_path = metadata_path.join("index.sqlite3");
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::InvalidVault("vault path must end in a directory name".into()))?
        .to_string();

    Ok(VaultContext {
        name,
        root_path: root.to_string_lossy().into_owned(),
        metadata_path: metadata_path.to_string_lossy().into_owned(),
        index_db_path: index_db_path.to_string_lossy().into_owned(),
    })
}
