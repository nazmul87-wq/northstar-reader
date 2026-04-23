use tauri::State;

use crate::{
    models::{BacklinkReference, IndexStatus, SearchResult},
    services,
    state::AppState,
};

#[tauri::command]
pub fn search_vault(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    services::indexer::search_current(state.inner(), &query, limit.unwrap_or(25)).map_err(Into::into)
}

#[tauri::command]
pub fn reindex_vault(state: State<'_, AppState>) -> Result<IndexStatus, String> {
    services::indexer::reindex_current(state.inner()).map_err(Into::into)
}

#[tauri::command]
pub fn sync_markdown_to_index(
    state: State<'_, AppState>,
    relative_path: String,
) -> Result<IndexStatus, String> {
    services::indexer::sync_current_file(state.inner(), &relative_path).map_err(Into::into)
}

#[tauri::command]
pub fn remove_markdown_from_index(
    state: State<'_, AppState>,
    relative_path: String,
) -> Result<IndexStatus, String> {
    services::indexer::remove_current_file(state.inner(), &relative_path).map_err(Into::into)
}

#[tauri::command]
pub fn get_backlinks(
    state: State<'_, AppState>,
    target_path: String,
    limit: Option<usize>,
) -> Result<Vec<BacklinkReference>, String> {
    services::indexer::backlinks_for_current(state.inner(), &target_path, limit.unwrap_or(100))
        .map_err(Into::into)
}
