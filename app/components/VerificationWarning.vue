<template>
  <div 
    v-if="store.isAuthenticated && !store.isCrossSigningReady && !store.verificationRequest"
    class="fixed bottom-4 right-4 z-40 max-w-sm"
  >
    <UiCard class="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 shadow-lg">
      <UiCardHeader class="pb-2">
        <div class="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <UiCardTitle class="text-base">Device Not Verified</UiCardTitle>
        </div>
      </UiCardHeader>
      
      <UiCardContent>
        <p class="text-sm text-muted-foreground mb-4">
          Verify this session to access encrypted messages history.
        </p>
        
        <UiButton 
          size="sm" 
          class="w-full" 
          @click="store.requestVerification()"
        >
          Verify Now
        </UiButton>
      </UiCardContent>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
const store = useMatrixStore();
</script>
