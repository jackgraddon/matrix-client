<template>
  <div
    v-if="isTauri"
    class="fixed top-0 left-0 right-0 h-[30px] w-full flex items-center justify-between select-none z-[9999]"
    data-tauri-drag-region
  >
    <div class="w-[135px] h-full flex items-center" data-tauri-drag-region />

    <div 
      class="flex-1 h-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground pointer-events-none"
      data-tauri-drag-region
    >
       <img src="~/assets/Flame.svg" class="size-3.5" alt="Tumult Logo" />
       Tumult
    </div>

    <div class="w-[135px] h-full flex items-center justify-end" data-tauri-drag-region />
  </div>
</template>

<script setup lang="ts">
const { $isTauri: isTauri } = useNuxtApp();
// You no longer need the OS detection, minimize, maximize, or close functions! 
// The system native controls will handle all of this automatically.
</script>
