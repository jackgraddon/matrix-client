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
// const matrixStore = useMatrixStore();

// onMounted(() => {
//   // MOVED TO PLUGINS/MATRIX.CLIENT.TS
//   // const accessToken = localStorage.getItem('matrix_access_token')!;
//   // const userId = localStorage.getItem('matrix_user_id')!;
//   // const deviceId = localStorage.getItem('matrix_device_id')!;
//   // const refreshToken = localStorage.getItem('matrix_refresh_token')!;
//   // matrixStore.initClient(accessToken, userId, deviceId, refreshToken);
// });
</script>
