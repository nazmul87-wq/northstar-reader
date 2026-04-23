mod commands;
mod error;
mod models;
mod services;
mod state;
mod storage;
mod util;
#[cfg(windows)]
mod webview_bootstrap;

use crate::state::AppState;
use tauri::Manager;

pub fn run() {
    #[cfg(windows)]
    webview_bootstrap::ensure_webview2_runtime();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let state = app.state::<AppState>();
            services::recents::bootstrap(app.handle(), state.inner())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault::open_vault,
            commands::vault::create_vault,
            commands::vault::current_vault,
            commands::vault::list_recent_vaults,
            commands::vault::remove_recent_vault,
            commands::files::read_markdown_file,
            commands::files::write_markdown_file,
            commands::files::list_file_tree,
            commands::files::create_markdown_file,
            commands::files::create_folder,
            commands::files::move_entry,
            commands::files::delete_entry,
            commands::search::search_vault,
            commands::search::reindex_vault,
            commands::search::sync_markdown_to_index,
            commands::search::remove_markdown_from_index,
            commands::search::get_backlinks,
            commands::watch::start_vault_watch,
            commands::watch::stop_vault_watch,
            commands::watch::watch_status
        ])
        .run(tauri::generate_context!())
        .expect("failed to run MD Readeder Tauri backend");
}
