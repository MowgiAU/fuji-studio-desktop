// File watcher.
//
// Watches a local project folder. When the .flp (or any meaningful file) changes,
// fires a debounced `watcher:changed` event to the frontend. The frontend can
// react by calling `sync_local_project`. We keep the debouncer alive in
// AppState — dropping it stops the watcher.

use crate::state::{AppState, WatchedFolder};
use notify::{EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::new_debouncer;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Serialize, Clone)]
pub struct WatchedEntry {
    pub project_id: String,
    pub local_path: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct WatcherChangedEvent {
    pub project_id: String,
    pub paths: Vec<String>,
}

#[tauri::command]
pub fn watch_project_folder(
    project_id: String,
    folder_path: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", folder_path));
    }

    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.watchers.contains_key(&project_id) {
            return Err("Already watching this project".to_string());
        }
    }

    let project_id_for_cb = project_id.clone();
    let app_for_cb = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_secs(2),
        None,
        move |result: notify_debouncer_full::DebounceEventResult| {
            match result {
                Ok(events) => {
                    let mut changed_paths: Vec<String> = Vec::new();
                    for ev in events {
                        let interesting = matches!(
                            ev.event.kind,
                            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                        );
                        if !interesting {
                            continue;
                        }
                        for p in &ev.event.paths {
                            // Ignore noisy/non-interesting files
                            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                                if name.ends_with('~') || name.ends_with(".tmp") {
                                    continue;
                                }
                            }
                            changed_paths.push(p.display().to_string());
                        }
                    }
                    if !changed_paths.is_empty() {
                        let _ = app_for_cb.emit(
                            "watcher:changed",
                            WatcherChangedEvent {
                                project_id: project_id_for_cb.clone(),
                                paths: changed_paths,
                            },
                        );
                    }
                }
                Err(errors) => {
                    log::warn!("Watcher errors: {:?}", errors);
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.watchers.insert(
        project_id.clone(),
        WatchedFolder {
            project_id: project_id.clone(),
            local_path: root,
            _debouncer: debouncer,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn unwatch_project_folder(
    project_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    if s.watchers.remove(&project_id).is_some() {
        Ok(())
    } else {
        Err("Not watching this project".to_string())
    }
}

#[tauri::command]
pub fn list_watched_folders(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<WatchedEntry>, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.watchers
        .values()
        .map(|w| WatchedEntry {
            project_id: w.project_id.clone(),
            local_path: w.local_path.display().to_string(),
        })
        .collect())
}
