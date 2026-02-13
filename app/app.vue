<template>
  <!-- <div class="fixed bottom-4 left-4 z-50">
    <ColorModeToggle />
  </div> -->
  <div class="min-h-screen bg-background text-foreground transition-colors">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
const matrixStore = useMatrixStore();

onMounted(() => {
  matrixStore.initClient();
});
</script>
