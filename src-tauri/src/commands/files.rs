use tauri::State;

use crate::{
    models::{FileTreeEntry, MarkdownDocument},
    services,
    state::AppState,
};

#[tauri::command]
pub fn read_markdown_file(
    state: State<'_, AppState>,
    relative_path: String,
) -> Result<MarkdownDocument, String> {
    services::fs_ops::read_markdown(state.inner(), &relative_path).map_err(Into::into)
}

#[tauri::command]
pub fn write_markdown_file(
    state: State<'_, AppState>,
    relative_path: String,
    content: String,
) -> Result<MarkdownDocument, String> {
    services::fs_ops::write_markdown(state.inner(), &relative_path, &content).map_err(Into::into)
}

#[tauri::command]
pub fn list_file_tree(
    state: State<'_, AppState>,
    max_depth: Option<usize>,
) -> Result<Vec<FileTreeEntry>, String> {
    services::fs_ops::list_tree(state.inner(), max_depth).map_err(Into::into)
}

#[tauri::command]
pub fn create_markdown_file(
    state: State<'_, AppState>,
    relative_path: String,
    content: Option<String>,
) -> Result<MarkdownDocument, String> {
    services::fs_ops::create_markdown_file(
        state.inner(),
        &relative_path,
        content.as_deref().unwrap_or_default(),
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn create_folder(
    state: State<'_, AppState>,
    relative_path: String,
) -> Result<FileTreeEntry, String> {
    services::fs_ops::create_folder(state.inner(), &relative_path).map_err(Into::into)
}

#[tauri::command]
pub fn move_entry(
    state: State<'_, AppState>,
    from_path: String,
    to_path: String,
) -> Result<FileTreeEntry, String> {
    services::fs_ops::move_entry(state.inner(), &from_path, &to_path).map_err(Into::into)
}

#[tauri::command]
pub fn delete_entry(
    state: State<'_, AppState>,
    relative_path: String,
    recursive: Option<bool>,
) -> Result<(), String> {
    services::fs_ops::delete_entry(state.inner(), &relative_path, recursive.unwrap_or(false))
        .map_err(Into::into)
}
