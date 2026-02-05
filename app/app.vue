<template>
  <main>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </main>
</template>

<script setup lang="ts">
const matrixStore = useMatrixStore();

onMounted(() => {
  matrixStore.startVestra();
});
</script>
