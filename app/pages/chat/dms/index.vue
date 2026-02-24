<template>
  <div>
    <h1>People</h1>
  </div>
</template>

<script lang="ts" setup>
const store = useMatrixStore();

onMounted(() => {
  if (store.lastVisitedRooms.dm) {
    navigateTo(`/chat/dms/${store.lastVisitedRooms.dm}`, { replace: true });
  }
});
</script>

<style>

</style>