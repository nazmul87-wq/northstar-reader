use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use walkdir::WalkDir;

use crate::{
    error::{display_path, AppError, AppResult},
    models::{EntryKind, FileTreeEntry, MarkdownDocument},
    services::{indexer, vaults},
    state::AppState,
    storage::atomic_write,
    util::paths,
};

const MAX_MARKDOWN_BYTES: u64 = 10 * 1024 * 1024;

pub fn read_markdown(state: &AppState, relative_path: &str) -> AppResult<MarkdownDocument> {
    let vault = vaults::current_vault(state)?;
    let root = PathBuf::from(&vault.root_path);
    let resolved = paths::resolve_markdown_path(&root, relative_path, false)?;
    read_markdown_from_absolute(&root, &resolved)
}

pub fn write_markdown(
    state: &AppState,
    relative_path: &str,
    content: &str,
) -> AppResult<MarkdownDocument> {
    let vault = vaults::current_vault(state)?;
    let root = PathBuf::from(&vault.root_path);
    let resolved = paths::resolve_markdown_path(&root, relative_path, true)?;

    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent)?;
    }

    atomic_write::write_text_atomic(&resolved, content)?;
    let relative = paths::relative_string(&root, &resolved)?;
    let _ = indexer::sync_vault_file(&vault, &relative);

    read_markdown_from_absolute(&root, &resolved)
}

pub fn create_markdown_file(
    state: &AppState,
    relative_path: &str,
    content: &str,
) -> AppResult<MarkdownDocument> {
    let vault = vaults::current_vault(state)?;
    let root = PathBuf::from(&vault.root_path);
    let resolved = paths::resolve_markdown_path(&root, relative_path, true)?;

    if resolved.exists() {
        return Err(AppError::InvalidPath(format!(
            "{} already exists",
            resolved.to_string_lossy()
        )));
    }

    write_markdown(state, relative_path, content)
}

pub fn create_folder(state: &AppState, relative_path: &str) -> AppResult<FileTreeEntry> {
    let vault = vaults::current_vault(state)?;
    let root = PathBuf::from(&vault.root_path);
    let resolved = paths::resolve_vault_path(&root, relative_path, true)?;

    if paths::is_internal_metadata_path(&root, &resolved) {
        return Err(AppError::ReservedPath(relative_path.to_string()));
    }

    fs::create_dir_all(&resolved)?;
    describe_entry(&root, &resolved)
}

pub fn list_tree(state: &AppState, max_depth: Option<usize>) -> AppResult<Vec<FileTreeEntry>> {
    let vault = vaults::current_vault(state)?;
    let root = PathBuf::from(&vault.root_path);
    let mut entries = Vec::new();

    for entry in WalkDir::new(&root)
        .min_depth(1)
        .into_iter()
        .filter_entry(|entry| filter_tree_entry(&root, entry.path()))
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let path = entry.path();
        if let Some(limit) = max_depth {
            if entry.depth().saturating_sub(1) > limit {
                continue;
            }
        }

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        let is_dir = metadata.is_dir();
        let is_markdown = metadata.is_file() && paths::is_markdown_path(path);
        if !is_dir && !is_markdown {
            continue;
        }

        entries.push(FileTreeEntry {
            path: paths::relative_string(&root, path)?,
            name: entry.file_name().to_string_lossy().into_owned(),
            kind: if is_dir {
                EntryKind::Directory
            } else {
                EntryKind::MarkdownFile
            },
            depth: entry.depth() - 1,
            parent_path: path
                .parent()
                .filter(|parent| *parent != root)
                .map(|parent| paths::relative_string(&root, parent))
                .transpose()?,
            size_bytes: if is_dir { None } else { Some(metadata.len()) },
            modified_ms: modified_ms(&metadata),
        });
    }

    entries.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(entries)
}

pub fn move_entry(
    state: &AppState,
    from_path: &str,
    to_path: &str,
) -> AppResult<FileTreeEntry> {
    let vault = vaults::current_vault(state)?;
    let root = PathBuf::from(&vault.root_path);
    let from = paths::resolve_vault_path(&root, from_path, false)?;
    let to = paths::resolve_vault_path(&root, to_path, true)?;

    if paths::is_internal_metadata_path(&root, &from) || paths::is_internal_metadata_path(&root, &to)
    {
        return Err(AppError::ReservedPath(format!("{from_path} -> {to_path}")));
    }

    if to.exists() {
        return Err(AppError::InvalidPath(format!(
            "{} already exists",
            to.to_string_lossy()
        )));
    }

    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }

    let metadata = fs::metadata(&from)?;
    let moved_path = metadata.is_dir();
    if metadata.is_file() && (!paths::is_markdown_path(&from) || !paths::is_markdown_path(&to)) {
        return Err(AppError::UnsupportedMarkdownPath(format!(
            "{from_path} -> {to_path}"
        )));
    }

    fs::rename(&from, &to)?;

    if moved_path {
        let _ = indexer::reindex_vault(&vault);
    } else {
        let old_relative = paths::relative_string(&root, &from)?;
        let new_relative = paths::relative_string(&root, &to)?;
        let _ = indexer::remove_vault_file(&vault, &old_relative);
        if paths::is_markdown_path(&to) {
            let _ = indexer::sync_vault_file(&vault, &new_relative);
        }
    }

    describe_entry(&root, &to)
}

pub fn delete_entry(
    state: &AppState,
    relative_path: &str,
    recursive: bool,
) -> AppResult<()> {
    let vault = vaults::current_vault(state)?;
    let root = PathBuf::from(&vault.root_path);
    let resolved = paths::resolve_vault_path(&root, relative_path, false)?;

    if paths::is_internal_metadata_path(&root, &resolved) {
        return Err(AppError::ReservedPath(relative_path.to_string()));
    }

    let metadata = fs::metadata(&resolved)?;
    if metadata.is_dir() {
        if recursive {
            fs::remove_dir_all(&resolved)?;
        } else {
            fs::remove_dir(&resolved)?;
        }
        let _ = indexer::reindex_vault(&vault);
        return Ok(());
    }

    if !paths::is_markdown_path(&resolved) {
        return Err(AppError::UnsupportedMarkdownPath(relative_path.to_string()));
    }

    fs::remove_file(&resolved)?;
    let relative = paths::relative_string(&root, &resolved)?;
    let _ = indexer::remove_vault_file(&vault, &relative);

    Ok(())
}

fn describe_entry(root: &Path, path: &Path) -> AppResult<FileTreeEntry> {
    let metadata = fs::metadata(path)?;
    let is_dir = metadata.is_dir();
    Ok(FileTreeEntry {
        path: paths::relative_string(root, path)?,
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| AppError::InvalidPath(display_path(&path.to_path_buf())))?
            .to_string(),
        kind: if is_dir {
            EntryKind::Directory
        } else {
            EntryKind::MarkdownFile
        },
        depth: path
            .strip_prefix(root)
            .map(|relative| relative.components().count().saturating_sub(1))
            .unwrap_or_default(),
        parent_path: path
            .parent()
            .filter(|parent| *parent != root)
            .map(|parent| paths::relative_string(root, parent))
            .transpose()?,
        size_bytes: if is_dir { None } else { Some(metadata.len()) },
        modified_ms: modified_ms(&metadata),
    })
}

fn read_markdown_from_absolute(root: &Path, path: &Path) -> AppResult<MarkdownDocument> {
    let metadata = fs::metadata(path)?;
    let size_bytes = metadata.len();
    if size_bytes > MAX_MARKDOWN_BYTES {
        return Err(AppError::FileTooLarge {
            path: path.to_string_lossy().into_owned(),
            size_bytes,
            max_bytes: MAX_MARKDOWN_BYTES,
        });
    }

    let content = fs::read_to_string(path)?;
    Ok(MarkdownDocument {
        path: paths::relative_string(root, path)?,
        content,
        size_bytes,
        modified_ms: modified_ms(&metadata).unwrap_or_else(epoch_ms),
    })
}

fn filter_tree_entry(root: &Path, path: &Path) -> bool {
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

fn modified_ms(metadata: &fs::Metadata) -> Option<i64> {
    metadata
        .modified()
        .ok()
        .and_then(system_time_to_ms)
}

fn system_time_to_ms(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as i64)
}

fn epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
