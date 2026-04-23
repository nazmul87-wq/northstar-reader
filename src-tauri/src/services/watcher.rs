use std::path::{Path, PathBuf};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::{
    error::{state_error, AppResult},
    models::{VaultContext, WatchEventPayload, WatchStatus},
    services::{indexer, vaults},
    state::{AppState, WatcherRegistration},
    util::paths,
};

pub fn start_for_current_vault(app: &AppHandle, state: &AppState) -> AppResult<WatchStatus> {
    let vault = vaults::current_vault(state)?;
    start_for_vault(app, state, &vault)
}

pub fn start_for_vault(
    app: &AppHandle,
    state: &AppState,
    vault: &VaultContext,
) -> AppResult<WatchStatus> {
    stop(state)?;

    let root = PathBuf::from(&vault.root_path);
    let app_handle = app.clone();
    let watched_vault = vault.clone();
    let watched_root = root.clone();

    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(move |event: notify::Result<Event>| {
            if let Ok(event) = event {
                handle_watch_event(&app_handle, &watched_vault, &watched_root, event);
            }
        })?;

    watcher.watch(&root, RecursiveMode::Recursive)?;

    let mut guard = state.watcher.lock().map_err(|_| state_error("watcher"))?;
    *guard = Some(WatcherRegistration {
        root_path: root.clone(),
        watcher,
    });

    Ok(WatchStatus {
        active: true,
        root_path: Some(root.to_string_lossy().into_owned()),
    })
}

pub fn stop(state: &AppState) -> AppResult<WatchStatus> {
    let mut guard = state.watcher.lock().map_err(|_| state_error("watcher"))?;
    let previous = guard.take();
    Ok(WatchStatus {
        active: false,
        root_path: previous.map(|registration| registration.root_path.to_string_lossy().into_owned()),
    })
}

pub fn status(state: &AppState) -> AppResult<WatchStatus> {
    let guard = state.watcher.lock().map_err(|_| state_error("watcher"))?;
    let current = guard.as_ref();
    Ok(WatchStatus {
        active: current.is_some(),
        root_path: current.map(|registration| registration.root_path.to_string_lossy().into_owned()),
    })
}

fn handle_watch_event(app: &AppHandle, vault: &VaultContext, root: &Path, event: Event) {
    let payload = WatchEventPayload {
        kind: watch_kind(&event.kind),
        paths: event
            .paths
            .iter()
            .filter_map(|path| relativize_watch_path(root, path))
            .collect(),
    };

    if !payload.paths.is_empty() {
        let _ = app.emit("vault://fs-event", &payload);
    }

    for path in event.paths {
        if let Some(relative) = relativize_watch_path(root, &path) {
            if path.exists() && path.is_file() && paths::is_markdown_path(&path) {
                let _ = indexer::sync_vault_file(vault, &relative);
            } else if !path.exists() {
                let _ = indexer::remove_vault_file(vault, &relative);
            }
        }
    }
}

fn relativize_watch_path(root: &Path, path: &Path) -> Option<String> {
    if paths::is_internal_metadata_path(root, path) {
        return None;
    }

    let relative = paths::relative_string(root, path).ok()?;
    if relative.is_empty() {
        return None;
    }

    Some(relative)
}

fn watch_kind(kind: &EventKind) -> String {
    match kind {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "remove",
        EventKind::Access(_) => "access",
        EventKind::Any => "any",
        EventKind::Other => "other",
    }
    .to_string()
}
