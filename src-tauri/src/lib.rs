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
    .manage(scanner_state)
    .invoke_handler(tauri::generate_handler![
        game_scanner::update_watch_list,
        game_scanner::set_scanner_enabled
    ])
    .setup(move |app| {
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
