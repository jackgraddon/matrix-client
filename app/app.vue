<template>
  <!-- <div class="fixed bottom-4 left-4 z-50">
    <ColorModeToggle />
  </div> -->
  <GlobalContextMenu>
    <div class="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground transition-colors">
      <CustomTitlebar />
      <NuxtRouteAnnouncer />
      <NuxtPage />
      <UiSonner />
    </div>
  </GlobalContextMenu>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';

const colorMode = useColorMode();

onMounted(() => {
  const appWindow = getCurrentWindow();

  // Watch for the resolved color mode ('light' or 'dark')
  watch(() => colorMode.value, async (newMode) => {
    // Light: oklch(1 0 0) -> #ffffff
    // Dark: oklch(0 0 0) -> #000000
    const bgColor = newMode === 'dark' ? '#000000' : '#ffffff'; 
    
    try {
      // Sync theme (affects titlebar on macOS and window decorations)
      await appWindow.setTheme(newMode as 'light' | 'dark');
      // Sync native background color
      await appWindow.setBackgroundColor(bgColor);
    } catch (err) {
      console.error("Failed to sync native theme/background:", err);
    }
  }, { immediate: true });
});
</script>
