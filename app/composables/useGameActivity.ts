import { ref, onUnmounted } from 'vue';
import { useMatrixStore } from '~/stores/matrix';

interface GameActivity {
    name: string;
    is_running: boolean;
}

interface DetectableGame {
    id: string;
    name: string;
    executables: { os: string; name: string }[];
}

const LOCAL_STORAGE_KEY = 'game_activity_enabled';

// Shared singleton state
const isEnabled = ref(false);
const isSupported = ref(false);
const currentActivity = ref<string | null>(null);

let initialized = false;
let unlisten: (() => void) | null = null;

/**
 * Determines the current OS string used in Discord's detectable games API.
 */
function getCurrentOs(): string {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'darwin';
    if (platform.includes('win')) return 'win32';
    return 'linux';
}

/**
 * Fetches Discord's detectable games list, filters for current OS,
 * and sends executables to the Rust backend.
 */
async function loadAndSendGameList() {
    try {
        const { invoke } = await import('@tauri-apps/api/core');

        const res = await fetch('https://discord.com/api/v9/applications/detectable');
        if (!res.ok) {
            console.warn('[GameActivity] Failed to fetch detectable games:', res.status);
            return;
        }

        const allGames: DetectableGame[] = await res.json();
        const os = getCurrentOs();

        // Filter to games that have executables for the current OS
        const filtered = allGames
            .filter(g => g.executables?.some(e => e.os === os))
            .map(g => ({
                id: g.id,
                name: g.name,
                executables: g.executables.filter(e => e.os === os),
            }));

        await invoke('update_watch_list', { games: filtered });
        console.log(`[GameActivity] Sent ${filtered.length} games to scanner`);
    } catch (err) {
        console.error('[GameActivity] Failed to load game list:', err);
    }
}

async function setMatrixPresence(statusMsg: string) {
    const store = useMatrixStore();
    if (!store.client) return;

    try {
        await store.client.setPresence({
            presence: 'online',
            status_msg: statusMsg,
        });
        console.log('[GameActivity] Updated Matrix presence:', statusMsg || '(cleared)');
    } catch (err) {
        console.error('[GameActivity] Failed to set Matrix presence:', err);
    }
}

async function startListening() {
    try {
        const { listen } = await import('@tauri-apps/api/event');
        const store = useMatrixStore();

        unlisten = (await listen<GameActivity>('game-activity', (event) => {
            const { name, is_running } = event.payload;

            if (is_running) {
                currentActivity.value = name;
                store.activityStatus = `Playing ${name}`;
                store.activityDetails = { name, is_running };
                setMatrixPresence(`Playing ${name}`);
            } else {
                currentActivity.value = null;
                store.activityStatus = null;
                store.activityDetails = null;
                setMatrixPresence('');
            }
        })) as unknown as () => void;

        // Load the game database and send to Rust
        await loadAndSendGameList();
    } catch (err) {
        console.error('[GameActivity] Failed to start listening:', err);
    }
}

function stopListening() {
    if (unlisten) {
        unlisten();
        unlisten = null;
    }
    const store = useMatrixStore();
    currentActivity.value = null;
    store.activityStatus = null;
    store.activityDetails = null;
    setMatrixPresence('');
}

function enable() {
    isEnabled.value = true;
    localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
    startListening();
}

function disable() {
    isEnabled.value = false;
    localStorage.setItem(LOCAL_STORAGE_KEY, 'false');
    stopListening();
}

function toggle() {
    if (isEnabled.value) {
        disable();
    } else {
        enable();
    }
}

/**
 * Composable for Tauri native game detection.
 * Initialize once at the chat layout level.
 * Gracefully no-ops in a browser (non-Tauri) environment.
 */
export function useGameActivity() {
    if (!initialized) {
        initialized = true;

        // Check if we're running inside Tauri
        isSupported.value = !!(window as any).__TAURI_INTERNALS__;

        if (isSupported.value) {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            isEnabled.value = stored === 'true';

            if (isEnabled.value) {
                startListening();
            }

            // Clear presence on tab/app close
            window.addEventListener('beforeunload', () => {
                if (currentActivity.value) {
                    const store = useMatrixStore();
                    if (store.client) {
                        store.client.setPresence({
                            presence: 'offline',
                            status_msg: '',
                        }).catch(() => { });
                    }
                }
            });
        }
    }

    return {
        isEnabled,
        isSupported,
        currentActivity,
        enable,
        disable,
        toggle,
    };
}
