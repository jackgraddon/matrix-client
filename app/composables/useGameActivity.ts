
export function useGameActivity() {
    const store = useMatrixStore();

    // Check for Tauri support
    const isSupported = ref(false);
    if (import.meta.client) {
        isSupported.value = !!(window as any).__TAURI_INTERNALS__;
    }

    function toggle() {
        store.setGameDetection(!store.isGameDetectionEnabled);
    }

    return {
        isEnabled: computed(() => store.isGameDetectionEnabled),
        isSupported: computed(() => isSupported.value),
        currentActivity: computed(() => store.activityDetails?.name || null),
        toggle
    };
}