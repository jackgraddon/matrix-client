<template>
  <div class="flex items-center gap-3">
    <div class="relative">
      <UiAvatar class="h-10 w-10 border">
        <UiAvatarImage v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="user.displayName" class="object-cover" />
        <UiAvatarFallback>{{ initials }}</UiAvatarFallback>
      </UiAvatar>
      
      <!-- Verification Status Indicator -->
      <button 
        @click.stop="store.isDeviceVerified ? null : store.requestVerification()"
        class="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-background border shadow-sm hover:bg-muted transition-colors"
        :title="store.isDeviceVerified ? 'Session Verified' : 'Verify Session'"
      >
        <svg 
          v-if="store.isDeviceVerified" 
          class="text-green-500 h-3 w-3" 
          xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
        
        <svg 
          v-else 
          class="text-red-500 h-3 w-3"
          xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
      </button>
    </div>
    <div class="flex flex-col">
      <span class="text-sm font-medium leading-none">{{ user?.displayName }}</span>
      <span class="text-xs text-muted-foreground">{{ user?.userId }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const matrixStore = useMatrixStore();
const store = matrixStore; // Alias for consistency
const user = computed(() => matrixStore.user);

console.log(user.value);

const initials = computed(() => {
  const name = user.value?.displayName || user.value?.userId || "ME";
  return name.slice(0, 2).toUpperCase();
});
</script>
