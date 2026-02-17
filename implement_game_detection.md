To implement the "Vesktop Way" (native game detection) in your Tauri app, you need to use the Rust backend to scan system processes and then "emit" that data to your Nuxt frontend.

Since Tauri doesn't run Node.js, you'll use Rust crates like **`sysinfo`** to monitor running applications.

### 1. Install Dependencies

In your `src-tauri` folder, add the `sysinfo` crate, which is the industry standard for cross-platform process management in Rust.

```bash
cd src-tauri
cargo add sysinfo

```

### 2. Create the Game Scanner in Rust

In `src-tauri/src/lib.rs` (or `main.rs`), create a background task that periodically scans for specific game executables.

```rust
use std::time::Duration;
use sysinfo::{ProcessExt, System, SystemExt};
use tauri::{AppHandle, Manager};
use serde::Serialize;

#[derive(Clone, Serialize)]
struct GameActivity {
    name: String,
    is_running: bool,
}

// A simple list of process names to watch for
const WATCH_LIST: &[&str] = &["EldenRing.exe", "Minecraft", "League of Legends.exe"];

pub fn start_game_scanner(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut sys = System::new_all();
        
        loop {
            sys.refresh_processes();
            
            for &game_proc in WATCH_LIST {
                let processes = sys.processes_by_exact_name(game_proc);
                let is_running = processes.count() > 0;

                if is_running {
                    // Emit to the Nuxt frontend
                    app.emit("game-detected", GameActivity {
                        name: game_proc.to_string(),
                        is_running: true,
                    }).unwrap();
                }
            }
            
            // Wait 15 seconds before scanning again (save CPU)
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
}

```

### 3. Initialize the Scanner

Update your `tauri::Builder` to launch this scanner when the app starts.

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Start the scanner and pass the app handle
            start_game_scanner(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

```

### 4. Connect to Nuxt 4 Frontend

In your Nuxt application, create a plugin or use a component to listen for these events. Instead of a WebSocket, you use the **Tauri Event API**.

```typescript
// app/plugins/tauri-rpc.client.ts
import { listen } from '@tauri-apps/api/event';

export default defineNuxtPlugin(async (nuxtApp) => {
  if (import.meta.client && window.__TAURI__) {
    
    // Listen for the 'game-detected' event from Rust
    const unlisten = await listen<{ name: string, is_running: boolean }>('game-detected', (event) => {
      const { name, is_running } = event.payload;
      
      if (is_running) {
        console.log(`Now playing: ${name}`);
        
        // Call your Matrix Presence update
        const client = nuxtApp.$matrixClient;
        if (client) {
            client.setPresence({
                presence: "online",
                status_msg: `Playing ${name}`
            });
        }
      }
    });

    // Clean up listener on app unmount
    onBeforeUnmount(() => unlisten());
  }
});

```

### 5. Why this is the "Vesktop Way"

* **Zero User Setup:** The user doesn't need to run `npx arrpc`. The scanner starts automatically with your app.
* **Native Speed:** Rust's `sysinfo` is extremely lightweight and won't lag the user's games.
* **Background Monitoring:** Using `tauri::async_runtime::spawn` ensures the scanner runs on a separate thread, keeping your UI perfectly smooth.

### Pro Tip: The "Database" approach

Vesktop and arRPC don't actually maintain their own massive internal `games.json`. Instead, they rely on **Discord's official API** to fetch the "detectable games" list.

If you want to implement this in your Tauri app, you can pull the same data.

### 1. Where to get the list

You can fetch the live, open-source database of detectable games directly from Discord's endpoint. This returns a JSON array of thousands of games, their executable names, and their "pretty" display names.

* **API Endpoint:** `https://discord.com/api/v9/applications/detectable`
* **Alternative:** Since that endpoint is very large (~4MB+), many projects use a cached version or specific mapping files.

### 2. How to use it with your Rust scanner

In your **Tauri Rust backend**, you shouldn't hardcode the games. Instead:

1. **Download the list** (or include a bundled copy) when the app starts.
2. **Filter the list** for the current OS (the JSON contains platform-specific fields like `executables` with `os: "win32"`).
3. **Scan your system** for any process matching those executable names.

### 3. Example of the `games.json` Structure

When you fetch that API, each entry looks like this:

```json
{
  "id": "app_id",
  "name": "Game Name",
  "executables": [
    {
      "os": "win32",
      "name": "eldenring.exe"
    },
    {
      "os": "linux",
      "name": "elden_ring"
    }
  ]
}

```

### 4. Implementation Logic

For a "Vesktop-style" experience in your Nuxt/Tauri app:

* **Nuxt (Frontend):** Fetches the `detectable` list from Discord once.
* **Nuxt -> Rust:** Sends the list of executable names to your Rust `start_game_scanner` command.
* **Rust:** Periodically checks `sysinfo` for matches and emits a `game-detected` event back to Nuxt.
* **Nuxt:** Maps the detected `.exe` back to the "Pretty Name" and updates your Matrix presence.