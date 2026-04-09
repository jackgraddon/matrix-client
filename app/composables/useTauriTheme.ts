import { useColorMode } from '#imports'

export function useTauriTheme() {
  const colorMode = useColorMode()

  async function applyTauriTheme() {
    const { invoke } = await import('@tauri-apps/api/core');

    // Initial sync on startup - use Rust command to bypass frozen webview state
    const theme = await invoke<string>('get_os_theme');
    console.log('[Theme] initial OS theme from Rust:', theme);
    if (theme) {
      colorMode.value = theme
    }

    // Listen for OS theme changes from Rust side
    const { listen } = await import('@tauri-apps/api/event');
    await listen<'light' | 'dark'>('os-theme-changed', ({ payload }) => {
      console.log('[Theme] Received os-theme-changed from Rust:', payload);
      if (colorMode.preference === 'system') {
        colorMode.value = payload;
      }
    });

    // Also apply immediately when user switches to auto/system,
    // using the Rust command for absolute accuracy.
    watch(() => colorMode.preference, async (pref) => {
      if (pref === 'system') {
        const theme = await invoke<string>('get_os_theme');
        console.log('[Theme] preference switched to system, new theme:', theme);
        if (theme) colorMode.value = theme;
      }
    });
  }

  return { applyTauriTheme }
}
