use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Notify;

use serde::{Deserialize, Serialize};
use sysinfo::{System, ProcessRefreshKind, RefreshKind, UpdateKind, ProcessesToUpdate};
use tauri::{AppHandle, Emitter};

/// A single executable entry from the detectable games list.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GameExecutable {
    pub os: String,
    pub name: String,
    pub arguments: Option<String>,
}

/// A detectable game entry sent from the frontend (sourced from Discord's API).
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DetectableGame {
    pub id: String,
    pub name: String,
    pub executables: Vec<GameExecutable>,
}

/// Payload emitted to the frontend when activity changes.
#[derive(Clone, Debug, Serialize)]
pub struct GameActivity {
    pub name: String,
    pub exe: String,
    pub is_running: bool,
}

/// Shared state for the scanner's watch list and current detected game.
pub struct ScannerState {
    pub watch_list: Mutex<Vec<DetectableGame>>,
    pub current_game: Mutex<Option<String>>,
    pub is_enabled: Mutex<bool>,
    pub notify: Arc<Notify>,
}

#[tauri::command]
pub fn set_scanner_enabled(state: tauri::State<'_, Arc<ScannerState>>, enabled: bool) {
    let mut is_enabled = state.is_enabled.lock().unwrap();
    if *is_enabled != enabled {
        *is_enabled = enabled;
        log::info!("[game_scanner] Scanner state set to: {}", enabled);
        // Wake up the loop immediately if enabled, or to process disable
        state.notify.notify_one();
    }
}

/// Tauri command: receives the filtered detectable games list from the frontend.
#[tauri::command]
pub fn update_watch_list(state: tauri::State<'_, Arc<ScannerState>>, games: Vec<DetectableGame>) {
    let count = games.len();
    let mut list = state.watch_list.lock().unwrap();
    *list = games;
    log::info!("[game_scanner] Watch list updated with {} games", count);
}

/// Starts the background game scanner loop.
pub fn start(app: AppHandle, state: Arc<ScannerState>) {
    tauri::async_runtime::spawn(async move {
        // sysinfo 0.30+ uses explicit builder pattern and UpdateKind enum
        let mut sys = System::new_with_specifics(
            RefreshKind::nothing().with_processes(ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always))
        );

        loop {
            // Check enabled state first
            let is_enabled = *state.is_enabled.lock().unwrap();

            if !is_enabled {
                // If disabled, wait indefinitely for a notification (enable command)
                log::info!("[game_scanner] Scanner disabled, waiting...");
                state.notify.notified().await;
                log::info!("[game_scanner] Scanner woke up!");
                continue;
            }

            // targeted refresh for process command lines
            sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always));

            let watch_list = state.watch_list.lock().unwrap().clone();
            let previous_game = state.current_game.lock().unwrap().clone();

            let mut detected_name: Option<String> = None;
            let mut detected_exe: Option<String> = None;

            // Iterate through all processes
            for (_pid, process) in sys.processes() {
                let exe_path = process.exe()
                    .map(|p| p.to_string_lossy().to_lowercase())
                    .unwrap_or_default();

                // Convert OsStr command line to standard String for matching
                let cmd_args: Vec<String> = process.cmd()
                    .iter()
                    .map(|s| s.to_string_lossy().to_string())
                    .collect();
                let full_command_line = cmd_args.join(" ");

                for game in &watch_list {
                    for exe in &game.executables {
                        // Check if the executable path/name matches (case-insensitive)
                        if exe_path.ends_with(&exe.name.to_lowercase()) {

                            // If detectable entry requires specific arguments, check concatenated command line
                            if let Some(ref required_args) = exe.arguments {
                                if !full_command_line.contains(required_args) {
                                    continue; // Name matched but arguments didn't
                                }
                            }

                            detected_name = Some(game.name.clone());
                            detected_exe = Some(exe.name.clone());
                            break;
                        }
                    }
                    if detected_name.is_some() { break; }
                }
                if detected_name.is_some() { break; }
            }

            // Only emit on state changes
            match (&previous_game, &detected_name) {
                (None, Some(name)) => {
                    // Game just started
                    let exe_str = detected_exe.as_deref().unwrap_or("unknown");
                    log::info!("[game_scanner] Detected: {} by {}", name, exe_str);
                    let _ = app.emit(
                        "game-activity",
                        GameActivity {
                            name: name.clone(),
                            exe: exe_str.to_string(),
                            is_running: true,
                        },
                    );
                }
                (Some(prev), None) => {
                    // Game just stopped
                    log::info!("[game_scanner] Stopped: {}", prev);
                    let _ = app.emit(
                        "game-activity",
                        GameActivity {
                            name: prev.clone(),
                            exe: "".to_string(),
                            is_running: false,
                        },
                    );
                }
                (Some(prev), Some(name)) if prev != name => {
                    // Switched games
                    let exe_str = detected_exe.as_deref().unwrap_or("unknown");
                    log::info!("[game_scanner] Switched: {} -> {} by {}", prev, name, exe_str);
                    let _ = app.emit(
                        "game-activity",
                        GameActivity {
                            name: name.clone(),
                            exe: exe_str.to_string(),
                            is_running: true,
                        },
                    );
                }
                _ => {
                    // No change — don't emit
                }
            }

            // Update current state
            *state.current_game.lock().unwrap() = detected_name;

            // Wait for 15s OR a notification (e.g. disable command or instant re-scan)
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(15)) => {},
                _ = state.notify.notified() => {
                    log::info!("[game_scanner] Scan interrupt received");
                }
            }
        }
    });
}
