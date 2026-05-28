// Fuji Studio Desktop — entry point + Tauri command registration
//
// Modules:
//   hasher  - SHA-256 streaming + directory walker
//   sync    - HTTP client for the project sync protocol
//   auth    - OAuth device-flow client
//   watcher - File watcher (notify crate)
//   state   - Shared app state

mod auth;
mod hasher;
mod state;
mod sync;
mod watcher;

use state::AppState;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            auth::start_device_auth,
            auth::poll_device_auth,
            auth::set_token,
            auth::get_token,
            auth::clear_token,
            auth::revoke_token,
            auth::set_api_base,
            auth::get_api_base,
            // Sync commands
            sync::list_remote_projects,
            sync::create_remote_project,
            sync::sync_local_project,
            sync::scan_local_folder,
            // Watcher commands
            watcher::watch_project_folder,
            watcher::unwatch_project_folder,
            watcher::list_watched_folders,
        ])
        .setup(|app| {
            // Initialize the system tray (only on desktop platforms)
            #[cfg(desktop)]
            {
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri::menu::{Menu, MenuItem};

                let show_item = MenuItem::with_id(app, "show", "Show Fuji Studio", true, None::<&str>)?;
                let sync_item = MenuItem::with_id(app, "sync_now", "Sync now", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_item, &sync_item, &quit_item])?;

                let _ = TrayIconBuilder::with_id("main-tray")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "sync_now" => {
                            let _ = app.emit("tray:sync_now", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide-to-tray instead of fully closing on user close
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running fuji studio desktop");
}
