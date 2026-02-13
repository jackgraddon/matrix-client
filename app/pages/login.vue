<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50">
    <UiCard class="w-full max-w-md">
      <UiCardHeader class="text-center">
        <UiCardTitle>Welcome to Chat</UiCardTitle>
        <UiCardDescription>
          Connecting to Matrix Homeserver...
        </UiCardDescription>
      </UiCardHeader>
      
      <UiCardContent class="flex flex-col gap-6">
        <UiAlert v-if="error" variant="destructive">
          <UiAlertTitle>Connection Error</UiAlertTitle>
          <UiAlertDescription>{{ error }}</UiAlertDescription>
        </UiAlert>

        <div v-else class="flex flex-col items-center gap-4 py-4">
          <UiSpinner size="lg" />
          <p class="text-sm text-muted-foreground">
            Redirecting to secure login...
          </p>
        </div>

        <UiButton 
          v-if="!isLoading" 
          @click="handleLogin" 
          class="w-full"
        >
          Sign In Manually
        </UiButton>
      </UiCardContent>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useMatrixStore } from '~/stores/matrix';

const matrixStore = useMatrixStore();
const isLoading = ref(true);
const error = ref<string | null>(null);

const handleLogin = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    // This runs the entire flow:
    // 1. Discover OIDC Config
    // 2. Register Client (Dynamic)
    // 3. Generate URL
    // 4. Redirect window
    await matrixStore.startLogin();
  } catch (err: any) {
    console.error("Login initialization failed:", err);
    error.value = err.message || "Failed to connect to the authentication server.";
    isLoading.value = false;
  }
};

// Automatically trigger login on mount
onMounted(() => {
  // We use a small timeout to ensure the UI renders first so the user sees what's happening
  setTimeout(() => {
    handleLogin();
  }, 500);
});
</script>