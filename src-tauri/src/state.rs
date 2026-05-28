// Shared application state — wrapped in a Mutex via tauri::State.

use std::collections::HashMap;
use std::path::PathBuf;

use notify_debouncer_full::{Debouncer, FileIdMap};
use notify::RecommendedWatcher;

/// A watched local folder mapped to a remote project id.
pub struct WatchedFolder {
    pub project_id: String,
    pub local_path: PathBuf,
    /// Keep the debouncer alive — it stops when dropped.
    pub _debouncer: Debouncer<RecommendedWatcher, FileIdMap>,
}

#[derive(Default)]
pub struct AppState {
    /// Access token from OAuth device flow (also kept on disk via tauri-plugin-store).
    pub token: Option<String>,

    /// Base URL of the Fuji Studio API (defaults to https://fujistud.io).
    pub api_base: Option<String>,

    /// Active project watchers (key: project_id).
    pub watchers: HashMap<String, WatchedFolder>,
}
