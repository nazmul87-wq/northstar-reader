use std::path::PathBuf;

use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("watch error: {0}")]
    Notify(#[from] notify::Error),
    #[error("invalid vault: {0}")]
    InvalidVault(String),
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("unsupported markdown path: {0}")]
    UnsupportedMarkdownPath(String),
    #[error("file not found: {0}")]
    NotFound(String),
    #[error("file is too large to open safely: {path} ({size_bytes} bytes, limit {max_bytes} bytes)")]
    FileTooLarge {
        path: String,
        size_bytes: u64,
        max_bytes: u64,
    },
    #[error("application state is unavailable: {0}")]
    State(String),
    #[error("tauri runtime error: {0}")]
    Tauri(String),
    #[error("path is reserved for internal app data: {0}")]
    ReservedPath(String),
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

pub fn state_error(name: &str) -> AppError {
    AppError::State(format!("{name} lock was poisoned"))
}

pub fn display_path(path: &PathBuf) -> String {
    path.to_string_lossy().into_owned()
}
