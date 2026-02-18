import { ref, watch, computed, onUnmounted } from 'vue';
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


const isSupported = ref(false);
const currentActivity = ref<string | null>(null);

let initialized = false;
let unlisten: (() => void) | null = null;

function getCurrentOs(): string {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'darwin';
    if (platform.includes('win')) return 'win32';
    return 'linux';
}

async function loadAndSendGameList() {
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await fetch('https://discord.com/api/v9/applications/detectable');
        if (!res.ok) return;

        const allGames: DetectableGame[] = await res.json();
        const os = getCurrentOs();

        const filtered = allGames
            .filter(g => g.executables?.some(e => e.os === os))
            .map(g => ({
                id: g.id,
                name: g.name,
                executables: g.executables.filter(e => e.os === os),
            }));

        await invoke('update_watch_list', { games: filtered });
    } catch (err) {
        console.error('[GameActivity] Failed to load game list:', err);
    }
}

/**
 * Enhanced Presence Update
 * Ensures we only update if the client is actually 'PREPARED'
 */
async function setMatrixPresence(statusMsg: string) {
    const store = useMatrixStore();
    // Only send if client exists and is syncing
    if (!store.client || store.client.getSyncState() !== 'PREPARED') {
        console.warn('[GameActivity] Client not ready, presence update deferred');
        return;
    }

    try {
        await store.client.setPresence({
            presence: statusMsg ? 'online' : 'online', // Keep online even when clearing msg
            status_msg: statusMsg,
        });
    } catch (err) {
        console.error('[GameActivity] Matrix presence error:', err);
    }
}

async function startListening() {
    try {
        const { listen } = await import('@tauri-apps/api/event');
        const store = useMatrixStore();

        unlisten = (await listen<GameActivity>('game-activity', (event) => {
            const { name, is_running } = event.payload;

            if (is_running && name !== currentActivity.value) {
                currentActivity.value = name;
                store.activityDetails = { name, is_running };
                setMatrixPresence(`Playing ${name}`);
            } else if (!is_running && currentActivity.value) {
                currentActivity.value = null;
                store.activityDetails = null;
                setMatrixPresence('');
            }
        })) as unknown as () => void;

        await loadAndSendGameList();
    } catch (err) {
        console.error('[GameActivity] Listener failed:', err);
    }
}

function stopListening() {
    if (unlisten) unlisten();
    unlisten = null;
    currentActivity.value = null;
    setMatrixPresence('');
}



function enable() {
    const store = useMatrixStore();
    store.setGameDetection(true);
    startListening();
}

function disable() {
    const store = useMatrixStore();
    store.setGameDetection(false);
    stopListening();
}

function toggle() {
    const store = useMatrixStore();
    if (store.isGameDetectionEnabled) {
        disable();
    } else {
        enable();
    }
}

export function useGameActivity() {
    const store = useMatrixStore();

    if (!initialized) {
        initialized = true;
        isSupported.value = !!(window as any).__TAURI_INTERNALS__;

        if (isSupported.value) {
            store.initGameDetection();

            // Watch store state to start/stop listening
            watch(() => store.isGameDetectionEnabled, (enabled) => {
                if (enabled) {
                    startListening();
                } else {
                    stopListening();
                }
            }, { immediate: true });

            /**
             * TAURI RELIABLE CLEANUP
             * 'beforeunload' is flaky for async network calls.
             * For Tauri, use the 'tauri://close-requested' event if possible, 
             * but for a composable, this is the best web-standard fallback.
             */
            window.addEventListener('pagehide', () => {
                const store = useMatrixStore();
                if (store.client && currentActivity.value) {
                    // Clearing the status message is more reliable for app-close cleanup
                    store.client.setPresence({
                        presence: 'online',
                        status_msg: ''
                    }).catch(() => { });
                }
            });
        }
    }

    return {
        return {
            isEnabled: computed(() => store.isGameDetectionEnabled),
            isSupported,
            currentActivity,
            enable,
            disable,
            toggle
        };
    }