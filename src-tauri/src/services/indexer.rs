use std::{collections::HashSet, fs, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

use walkdir::WalkDir;

use crate::{
    error::{AppError, AppResult},
    models::{BacklinkReference, IndexStatus, SearchResult, VaultContext},
    services::vaults,
    state::AppState,
    storage::index_db,
    util::paths,
};

const MAX_INDEXED_BYTES: u64 = 10 * 1024 * 1024;

pub fn ensure_initialized(vault: &VaultContext) -> AppResult<()> {
    index_db::ensure_database(vault)
}

pub fn reindex_current(state: &AppState) -> AppResult<IndexStatus> {
    let vault = vaults::current_vault(state)?;
    reindex_vault(&vault)
}

pub fn reindex_vault(vault: &VaultContext) -> AppResult<IndexStatus> {
    ensure_initialized(vault)?;

    let root = PathBuf::from(&vault.root_path);
    let mut status = IndexStatus::default();
    let mut seen_paths = HashSet::new();

    for entry in WalkDir::new(&root)
        .min_depth(1)
        .into_iter()
        .filter_entry(|entry| filter_index_entry(&root, entry.path()))
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                status.skipped_documents += 1;
                continue;
            }
        };

        if !entry.file_type().is_file() || !paths::is_markdown_path(entry.path()) {
            continue;
        }

        let relative = paths::relative_string(&root, entry.path())?;
        seen_paths.insert(relative.clone());

        match sync_vault_file(vault, &relative) {
            Ok(_) => status.indexed_documents += 1,
            Err(_) => status.skipped_documents += 1,
        }
    }

    for indexed_path in index_db::list_indexed_paths(vault)? {
        if !seen_paths.contains(&indexed_path) {
            remove_vault_file(vault, &indexed_path)?;
            status.deleted_documents += 1;
        }
    }

    Ok(status)
}

pub fn sync_current_file(state: &AppState, relative_path: &str) -> AppResult<IndexStatus> {
    let vault = vaults::current_vault(state)?;
    let relative = normalize_markdown_relative(&PathBuf::from(&vault.root_path), relative_path)?;
    sync_vault_file(&vault, &relative)?;

    Ok(IndexStatus {
        indexed_documents: 1,
        deleted_documents: 0,
        skipped_documents: 0,
        updated_path: Some(relative),
    })
}

pub fn remove_current_file(state: &AppState, relative_path: &str) -> AppResult<IndexStatus> {
    let vault = vaults::current_vault(state)?;
    let relative = normalize_markdown_relative(&PathBuf::from(&vault.root_path), relative_path)?;
    remove_vault_file(&vault, &relative)?;

    Ok(IndexStatus {
        indexed_documents: 0,
        deleted_documents: 1,
        skipped_documents: 0,
        updated_path: Some(relative),
    })
}

pub fn search_current(state: &AppState, query: &str, limit: usize) -> AppResult<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let vault = vaults::current_vault(state)?;
    index_db::search(&vault, query, limit.max(1))
}

pub fn backlinks_for_current(
    state: &AppState,
    target_path: &str,
    limit: usize,
) -> AppResult<Vec<BacklinkReference>> {
    let vault = vaults::current_vault(state)?;
    let relative = normalize_markdown_relative(&PathBuf::from(&vault.root_path), target_path)?;
    index_db::backlinks(&vault, &relative, limit.max(1))
}

pub fn sync_vault_file(vault: &VaultContext, relative_path: &str) -> AppResult<()> {
    let root = PathBuf::from(&vault.root_path);
    let absolute = paths::resolve_markdown_path(&root, relative_path, false)?;
    let metadata = fs::metadata(&absolute)?;

    if metadata.len() > MAX_INDEXED_BYTES {
        return Err(AppError::FileTooLarge {
            path: absolute.to_string_lossy().into_owned(),
            size_bytes: metadata.len(),
            max_bytes: MAX_INDEXED_BYTES,
        });
    }

    let content = fs::read_to_string(&absolute)?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_else(epoch_ms);

    index_db::upsert_document(vault, relative_path, &content, modified_ms)
}

pub fn remove_vault_file(vault: &VaultContext, relative_path: &str) -> AppResult<()> {
    let root = PathBuf::from(&vault.root_path);
    let relative = normalize_markdown_relative(&root, relative_path)?;
    index_db::delete_document(vault, &relative)
}

fn normalize_markdown_relative(root: &Path, relative_path: &str) -> AppResult<String> {
    let relative = paths::normalize_relative_path(relative_path)?;
    if !paths::is_markdown_path(&relative) {
        return Err(AppError::UnsupportedMarkdownPath(relative_path.to_string()));
    }

    let absolute = root.join(relative);
    paths::relative_string(root, &absolute)
}

fn filter_index_entry(root: &Path, path: &Path) -> bool {
    if path == root {
        return true;
    }

    if paths::is_internal_metadata_path(root, path) {
        return false;
    }

    path.file_name()
        .and_then(|value| value.to_str())
        .map(|name| !paths::should_skip_directory_name(name))
        .unwrap_or(true)
}

fn epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
