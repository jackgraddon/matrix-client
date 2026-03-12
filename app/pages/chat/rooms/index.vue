<template>
  <div>
    <h1>Rooms</h1>
  </div>
</template>

<script lang="ts" setup>
const store = useMatrixStore();

onMounted(() => {
  // On desktop, we might want to auto-redirect, but on mobile it breaks the sidebar navigation
  const isMobile = window.innerWidth < 768;
  if (!isMobile && store.lastVisitedRooms.rooms) {
    navigateTo(`/chat/rooms/${store.lastVisitedRooms.rooms}`, { replace: true });
  }
});
</script>

<style>

</style>