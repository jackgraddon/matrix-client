
import { getCurrentWindow } from '@tauri-apps/api/window';

export default defineNuxtPlugin(async (nuxtApp) => {
    // Only run on client side and in Tauri environment
    const isTauri = process.client && !!(window as any).__TAURI_INTERNALS__;
    if (!isTauri) return;

    const colorMode = useColorMode();
    const appWindow = getCurrentWindow();

    /**
     * Nudges Nuxt's color mode to match the system theme.
     * Nuxt usually relies on matchMedia which can be unreliable in WebViews.
     */
    const syncTheme = (theme: 'light' | 'dark' | string) => {
        if (colorMode.preference === 'system') {
            console.log("[TauriTheme] Syncing system theme:", theme);
            // We set the preference to the actual theme temporarily to force 'value' to update,
            // then set it back to 'system'.
            const currentTheme = theme as 'light' | 'dark';
            colorMode.preference = currentTheme;

            // Revert to 'system' in the next tick
            setTimeout(() => {
                colorMode.preference = 'system';
            }, 10);
        }
    };

    // 1. Initial Sync
    try {
        const currentTheme = await appWindow.theme();
        if (currentTheme) {
            syncTheme(currentTheme);
        }
    } catch (e) {
        console.warn("[TauriTheme] Failed to get initial theme:", e);
    }

    // 2. Listen for Changes
    const unlisten = await appWindow.onThemeChanged(({ payload: theme }) => {
        syncTheme(theme);
    });

    // Clean up on unmount (though plugins usually live for the app lifetime)
    nuxtApp.hook('app:unmounted', () => {
        unlisten();
    });
});
