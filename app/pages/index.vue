<template>
  <div>
    <h1>Welcome to Matrix Client</h1>
    <p>Please login to continue</p>
    <NuxtLink to="/login" v-if="!isAuthenticated">Login</NuxtLink>
    <div v-else>
      <p>You are logged in as {{ matrixStore.userId }}</p>
      <NuxtLink to="/app">App</NuxtLink>
      <button @click="logout">Logout</button>
    </div>
  </div>
</template>

<script lang="ts" setup>
const matrixStore = useMatrixStore();
const { isAuthenticated } = storeToRefs(matrixStore);
const { logout } = matrixStore; // Actions can be destructured directly
</script>

<style scoped>

</style>