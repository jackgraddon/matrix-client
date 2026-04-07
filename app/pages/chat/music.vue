<template>
  <div class="flex flex-col h-full">
    <header class="flex items-center h-12 p-2 border-b border-border shrink-0">
      <UiButton variant="ghost" size="icon" class="md:hidden" @click="matrixStore.toggleSidebar(true)">
        <Icon name="solar:hamburger-menu-linear" />
      </UiButton>
      <h1 class="text-lg font-semibold ml-2">Music Library</h1>
    </header>

    <div class="flex-1 overflow-hidden">
      <NuxtPage />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMatrixStore } from '~/stores/matrix';

const matrixStore = useMatrixStore();
</script>
