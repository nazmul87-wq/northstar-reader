use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use crate::error::{AppError, AppResult};

pub const VAULT_METADATA_DIR: &str = ".northstar";

pub fn canonicalize_vault_root(path: &Path) -> AppResult<PathBuf> {
    if !path.exists() {
        return Err(AppError::InvalidVault(format!(
            "{} does not exist",
            path.to_string_lossy()
        )));
    }

    if !path.is_dir() {
        return Err(AppError::InvalidVault(format!(
            "{} is not a directory",
            path.to_string_lossy()
        )));
    }

    Ok(fs::canonicalize(path)?)
}

pub fn normalize_relative_path(value: &str) -> AppResult<PathBuf> {
    let candidate = value.trim();
    if candidate.is_empty() {
        return Err(AppError::InvalidPath("relative path cannot be empty".into()));
    }

    let path = Path::new(candidate);
    if path.is_absolute() {
        return Err(AppError::InvalidPath(candidate.into()));
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => {
                if part.to_string_lossy() == VAULT_METADATA_DIR {
                    return Err(AppError::ReservedPath(candidate.into()));
                }
                normalized.push(part);
            }
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(AppError::InvalidPath(candidate.into()))
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(AppError::InvalidPath(candidate.into()));
    }

    Ok(normalized)
}

pub fn resolve_markdown_path(root: &Path, relative_path: &str, allow_missing: bool) -> AppResult<PathBuf> {
    let path = resolve_vault_path(root, relative_path, allow_missing)?;
    if !is_markdown_path(&path) {
        return Err(AppError::UnsupportedMarkdownPath(relative_path.into()));
    }
    Ok(path)
}

pub fn resolve_vault_path(root: &Path, relative_path: &str, allow_missing: bool) -> AppResult<PathBuf> {
    let canonical_root = canonicalize_vault_root(root)?;
    let relative = normalize_relative_path(relative_path)?;
    let candidate = canonical_root.join(relative);
    ensure_within_root(&canonical_root, &candidate, allow_missing)
}

pub fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()),
        Some(extension) if matches!(extension.as_str(), "md" | "markdown" | "mdown" | "mkd")
    )
}

pub fn relative_string(root: &Path, path: &Path) -> AppResult<String> {
    let canonical_root = canonicalize_vault_root(root)?;
    let relative = if path.exists() {
        fs::canonicalize(path)
            .ok()
            .and_then(|canonical_path| canonical_path.strip_prefix(&canonical_root).ok().map(PathBuf::from))
            .or_else(|| path.strip_prefix(&canonical_root).ok().map(PathBuf::from))
    } else {
        path.strip_prefix(&canonical_root).ok().map(PathBuf::from)
    }
    .ok_or_else(|| AppError::InvalidPath(path.to_string_lossy().into_owned()))?;

    Ok(to_forward_slashes(&relative))
}

pub fn to_forward_slashes(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub fn is_internal_metadata_path(root: &Path, path: &Path) -> bool {
    if path == root {
        return false;
    }

    path.strip_prefix(root)
        .ok()
        .and_then(|relative| relative.components().next())
        .map(|component| {
            matches!(component, Component::Normal(part) if part.to_string_lossy() == VAULT_METADATA_DIR)
        })
        .unwrap_or(false)
}

pub fn should_skip_directory_name(name: &str) -> bool {
    matches!(name, ".git" | ".idea" | ".vscode" | "node_modules" | "dist")
        || name == VAULT_METADATA_DIR
}

fn ensure_within_root(root: &Path, candidate: &Path, allow_missing: bool) -> AppResult<PathBuf> {
    if candidate.exists() {
        let canonical = fs::canonicalize(candidate)?;
        if !canonical.starts_with(root) {
            return Err(AppError::InvalidPath(candidate.to_string_lossy().into_owned()));
        }
        return Ok(canonical);
    }

    if !allow_missing {
        return Err(AppError::NotFound(candidate.to_string_lossy().into_owned()));
    }

    let parent = candidate.parent().ok_or_else(|| {
        AppError::InvalidPath(format!(
            "{} does not have a parent directory",
            candidate.to_string_lossy()
        ))
    })?;
    let existing_parent = nearest_existing_ancestor(parent)?;
    if !existing_parent.starts_with(root) {
        return Err(AppError::InvalidPath(candidate.to_string_lossy().into_owned()));
    }

    Ok(candidate.to_path_buf())
}

fn nearest_existing_ancestor(path: &Path) -> AppResult<PathBuf> {
    let mut cursor = Some(path);
    while let Some(current) = cursor {
        if current.exists() {
            return Ok(fs::canonicalize(current)?);
        }
        cursor = current.parent();
    }

    Err(AppError::InvalidPath(path.to_string_lossy().into_owned()))
}
