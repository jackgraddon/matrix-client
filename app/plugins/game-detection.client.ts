export default defineNuxtPlugin(() => {
    console.log('[GameDetectionPlugin] Plugin loaded!');

    if (!(window as any).__TAURI_INTERNALS__) {
        console.log('[GameDetectionPlugin] Not in Tauri, skipping.');
        return;
    }

    const store = useMatrixStore();

    console.log('[GameDetectionPlugin] Initializing game detection...');

    // Initialize state from localStorage and sync with backend
    store.initGameDetection();

    // Bind the Tauri event listener for game-activity events
    store.bindGameActivityListener();
});
