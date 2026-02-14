<template>
  <div>
    <h1>Settings</h1>
    <!-- Logout -->
    <UiButton @click="logout">Logout</UiButton>
    <UiButton 
        variant="ghost" 
        size="icon" 
        @click="store.isDeviceVerified ? null : store.requestVerification()"
        :title="store.isDeviceVerified ? 'Session Verified' : 'Verify Session'"
      >
        <svg 
          v-if="store.isDeviceVerified" 
          class="text-green-500" 
          xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
        
        <svg 
          v-else 
          class="text-red-500 animate-pulse"
          xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
      </UiButton>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
    middleware: "auth",
});

const store = useMatrixStore();

function logout () {
    store.logout();
}
</script>

<style scoped>

</style>