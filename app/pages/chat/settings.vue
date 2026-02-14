<template>
  <div>
    <h1>Settings</h1>
    <!-- Logout -->
    <UiButton @click="logout">Logout</UiButton>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
    middleware: "auth",
});

function logout () {
    const matrixStore = useMatrixStore();
    matrixStore.logout();
}
</script>

<style scoped>

</style>