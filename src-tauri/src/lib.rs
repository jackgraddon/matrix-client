mod game_scanner;

use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create the shared scanner state
    let scanner_state = Arc::new(game_scanner::ScannerState {
        watch_list: Mutex::new(Vec::new()),
        current_game: Mutex::new(None),
        is_enabled: Mutex::new(false),
        notify: Arc::new(Notify::new()),
    });

    let scanner_state_for_setup = scanner_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_shell::init())
        .manage(scanner_state)
        .invoke_handler(tauri::generate_handler![
            game_scanner::update_watch_list,
            game_scanner::set_scanner_enabled
        ])
        .setup(move |app| {
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                use tauri::Manager;
                let window = app.get_webview_window("main").unwrap();
                // 1. Strip the clunky default OS title bar
                window.set_decorations(false).unwrap();
                // 2. Force the OS to redraw the native drop shadow and rounded corners!
                window.set_shadow(true).unwrap();
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start the background game scanner
            game_scanner::start(app.handle().clone(), scanner_state_for_setup);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
