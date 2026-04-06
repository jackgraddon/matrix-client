<template>
  <div class="flex flex-col h-full">
    <header class="flex items-center h-12 p-2 border-b border-border shrink-0">
      <UiButton variant="ghost" size="icon" class="md:hidden" @click="matrixStore.toggleSidebar(true)">
        <Icon name="solar:hamburger-menu-linear" />
      </UiButton>
      <h1 class="text-lg font-semibold ml-2">Music Library</h1>
      <div class="ml-auto flex items-center gap-2">
        <UiInput v-model="searchQuery" placeholder="Search music..." class="h-8 w-64" @keyup.enter="doSearch" />
        <UiButton size="sm" @click="doSearch">Search</UiButton>
      </div>
    </header>

    <div class="flex-1 overflow-hidden">
      <NuxtPage />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMatrixStore } from '~/stores/matrix';

const matrixStore = useMatrixStore();
const searchQuery = ref('');

function doSearch() {
  if (!searchQuery.value) return;
  navigateTo(`/chat/music/search?q=${encodeURIComponent(searchQuery.value)}`);
}
</script>
