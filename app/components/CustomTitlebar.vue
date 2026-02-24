<template>
  <div
    class="flex h-[30px] w-full shrink-0 items-center justify-between select-none z-50 transition-colors bg-neutral-200 dark:bg-background"
    data-tauri-drag-region
    @mousedown="startDrag"
  >
    <!-- Left Side: macOS Traffic Lights (Only visible on macOS, or if we default to it) -->
    <div class="flex h-full w-[100px] items-center gap-2 pl-3">
      <!-- <div v-if="isMac" class="flex items-center gap-2 w-full h-full group">
        <button 
          class="h-3 w-3 rounded-full bg-[#ff5f56] flex items-center justify-center"
          @click="closeWindow"
          aria-label="Close Window"
        >
          <svg class="h-[7px] w-[7px] text-[#4c0000] opacity-0 group-hover:opacity-100 pointer-events-none" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
        <button 
          class="h-3 w-3 rounded-full bg-[#ffbd2e] flex items-center justify-center"
          @click="minimizeWindow"
          aria-label="Minimize Window"
        >
          <svg class="h-[7px] w-[7px] text-[#995700] opacity-0 group-hover:opacity-100 pointer-events-none" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="1" y1="5" x2="9" y2="5" />
          </svg>
        </button>
        <button 
          class="h-3 w-3 rounded-full bg-[#27c93f] flex items-center justify-center"
          @click="maximizeWindow"
          aria-label="Maximize Window"
        >
          <svg class="h-[6px] w-[6px] text-[#006500] opacity-0 group-hover:opacity-100 pointer-events-none" viewBox="0 0 10 10" fill="currentColor">
            <path d="M0.5,0.5 L6,0.5 L0.5,6 Z" />
            <path d="M9.5,9.5 L4,9.5 L9.5,4 Z" />
          </svg>
        </button>
      </div> -->
    </div>

    <!-- Center: Optional Title -->
    <div class="flex-1 flex justify-center text-xs text-muted-foreground pointer-events-none" data-tauri-drag-region @mousedown="startDrag">
       Matrix Client
    </div>

    <!-- Right Side: Windows/Linux standard controls (Only visible on non-macOS) -->
    <div class="flex h-full w-[135px] items-center justify-end">
      <div v-if="!isMac" class="flex h-full">
        <button 
          class="h-full w-[45px] hover:bg-muted flex items-center justify-center transition-colors"
          @click="minimizeWindow"
          aria-label="Minimize Window"
        >
          <Icon name="lucide:minus" class="h-4 w-4 text-muted-foreground pointer-events-none" />
        </button>
        <button 
          class="h-full w-[45px] hover:bg-muted flex items-center justify-center transition-colors"
          @click="maximizeWindow"
          aria-label="Maximize Window"
        >
          <Icon name="lucide:square" class="h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </button>
        <button 
          class="h-full w-[45px] hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-colors"
          @click="closeWindow"
          aria-label="Close Window"
        >
          <Icon name="lucide:x" class="h-4 w-4 text-muted-foreground pointer-events-none" group-hover:text-destructive-foreground />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type } from '@tauri-apps/plugin-os';
import { getCurrentWindow } from '@tauri-apps/api/window';

const isMac = ref(true); // Default to true to prevent visual pop on macos

onMounted(async () => {
  try {
    const osType = await type();
    isMac.value = osType === 'macos';
  } catch (error) {
    console.warn("Failed to detect OS for titlebar", error);
    if (typeof window !== 'undefined') {
      isMac.value = navigator.userAgent.toLowerCase().includes('mac');
    }
  }
});

const closeWindow = async () => {
  const appWindow = getCurrentWindow();
  await appWindow.close();
};

const minimizeWindow = async () => {
  const appWindow = getCurrentWindow();
  await appWindow.minimize();
};

const maximizeWindow = async () => {
  const appWindow = getCurrentWindow();
  await appWindow.toggleMaximize();
};

const startDrag = async (e: MouseEvent) => {
  if (e.target instanceof HTMLElement && e.target.closest('button')) return;
  const appWindow = getCurrentWindow();
  await appWindow.startDragging();
};
</script>
