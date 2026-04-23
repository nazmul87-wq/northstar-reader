use std::{
    path::PathBuf,
    sync::{Mutex, RwLock},
};

use notify::RecommendedWatcher;

use crate::models::{RecentVault, VaultContext};

#[derive(Default)]
pub struct SessionState {
    pub current_vault: Option<VaultContext>,
}

pub struct WatcherRegistration {
    pub root_path: PathBuf,
    pub watcher: RecommendedWatcher,
}

pub struct AppState {
    pub session: RwLock<SessionState>,
    pub recents: RwLock<Vec<RecentVault>>,
    pub watcher: Mutex<Option<WatcherRegistration>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            session: RwLock::new(SessionState::default()),
            recents: RwLock::new(Vec::new()),
            watcher: Mutex::new(None),
        }
    }
}
