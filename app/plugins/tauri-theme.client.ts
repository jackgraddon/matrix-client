
import { getCurrentWindow } from '@tauri-apps/api/window';

export default defineNuxtPlugin(async () => {
  const colorMode = useColorMode();
  
  // Guard: Only run if we are inside the Tauri environment
  // @ts-ignore - Tauri internals are injected at runtime
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;

  const appWindow = getCurrentWindow();

  /**
   * Helper to sync the Nuxt color mode with the native Tauri theme
   * only when the user has "System" selected.
   */
  const syncWithNativeTheme = async (themeOverride?: string) => {
    if (colorMode.preference === 'system') {
      const theme = themeOverride || await appWindow.theme();
      console.log("[TauriTheme] Syncing with native theme:", theme);
      
      if (theme) {
        // Manually update the DOM class as a fallback since prefers-color-scheme 
        // can be unreliable in the WebView. Nuxt-color-mode uses .dark or .light
        // (or .dark-mode/.light-mode depending on config, but default is just theme name)
        document.documentElement.className = theme;
        
        // Re-assign 'system' to nudge Nuxt's internal state
        colorMode.preference = 'system';
      }
    }
  };

  // 1. Initial sync on app load
  await syncWithNativeTheme();

  // 2. Listen for real-time OS theme changes
  // This listener bypasses the unreliable CSS media query
  await appWindow.onThemeChanged(({ payload: theme }) => {
    syncWithNativeTheme(theme);
  });

  // 3. Watch for when the user clicks "System" in the appearance settings
  watch(() => colorMode.preference, async (newPref) => {
    if (newPref === 'system') {
      await syncWithNativeTheme();
    }
  });
});
