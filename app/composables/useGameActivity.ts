import { ActivityService } from '~/services/activity.service';

export function useGameActivity() {
    const store = useMatrixStore();
    const activityStore = useActivityStore();
    const activityService = ActivityService.getInstance();

    // Check for Tauri support
    const { $isTauri: isTauri } = useNuxtApp();
    const isSupported = ref(isTauri);

    // rsRPC WebSocket state
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let intentionalClose = false;

    const RPC_PORT = 1337;
    const RECONNECT_INTERVAL = 5000;

    function decodeMessage(data: string | ArrayBuffer) {
        if (typeof data === 'string') return JSON.parse(data);
        // ArrayBuffer fallback (JSON over binary frame, not MessagePack)
        return JSON.parse(new TextDecoder().decode(data));
    }

    function scheduleReconnect() {
        if (intentionalClose || reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            // Only reconnect if still enabled
            if (activityStore.gameDetectionLevel !== 'off') connectRpc();
        }, RECONNECT_INTERVAL);
    }

    function connectRpc() {
        if (!isTauri) return;
        if (ws?.readyState === WebSocket.OPEN) return;

        intentionalClose = false;

        try {
            ws = new WebSocket(`ws://127.0.0.1:${RPC_PORT}?format=json`);
            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                // Nothing extra needed — rsRPC pushes updates to us
            };

            ws.onclose = () => {
                scheduleReconnect();
            };

            ws.onerror = () => {
                // onclose will fire after onerror, reconnect handled there
            };

            ws.onmessage = (event) => {
                try {
                    const data = decodeMessage(event.data);
                    // rsRPC sends the full activity payload — write it into the store
                    // so the rest of the app (presence broadcasting, UI) reacts normally
                    activityService.handleRpcActivity(data);
                } catch (e) {
                    console.error('[useGameActivity] Failed to decode rsRPC message:', e);
                }
            };
        } catch (e) {
            console.error('[useGameActivity] Failed to connect to rsRPC:', e);
            scheduleReconnect();
        }
    }

    function disconnectRpc() {
        intentionalClose = true;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        ws?.close();
        ws = null;
        // Clear activity from the store when RPC is disabled
        activityStore.setActivityDetails(null);
    }

    function toggle() {
        const next = activityStore.gameDetectionLevel === 'off' ? 'basic' : 'off';
        activityService.setGameDetectionLevel(next);
        // Drive the connection based on the new level
        if (next === 'off') {
            disconnectRpc();
        } else {
            connectRpc();
        }
    }

    // Connect immediately if already enabled (e.g. composable mounted after app init)
    if (isTauri && activityStore.gameDetectionLevel !== 'off') {
        connectRpc();
    }

    // Tear down the socket when the owning component unmounts
    onUnmounted(disconnectRpc);

    return {
        isEnabled: computed(() => activityStore.gameDetectionLevel !== 'off'),
        gameDetectionLevel: computed(() => activityStore.gameDetectionLevel),
        isSupported: computed(() => isSupported.value),
        currentActivity: computed(() => activityStore.activityDetails?.name || null),
        toggle,
    };
}