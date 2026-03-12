<template>
  <div>
    <h1>People</h1>
  </div>
</template>

<script lang="ts" setup>
const store = useMatrixStore();

onMounted(() => {
  // On desktop, we might want to auto-redirect, but on mobile it breaks the sidebar navigation
  const isMobile = window.innerWidth < 768;
  if (!isMobile && store.lastVisitedRooms.dm) {
    navigateTo(`/chat/dms/${store.lastVisitedRooms.dm}`, { replace: true });
  }
});
</script>

<style>

</style>