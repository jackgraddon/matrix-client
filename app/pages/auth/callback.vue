<template>
  <div class="flex items-center justify-center h-screen">
    <UiCard class="w-full sm:max-w-md" v-if="error">
      <UiCardHeader>
        <UiCardTitle>Login Failed</UiCardTitle>
        <UiCardDescription>
          An error occurred during authentication.
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <UiAlert variant="destructive" class="mb-4">
          <UiAlertTitle>{{ error.title }}</UiAlertTitle>
          <UiAlertDescription>
            <p>{{ error.description }}</p>
          </UiAlertDescription>
        </UiAlert>
        <UiButton @click="backOut" class="w-full">
          Return to Home
        </UiButton>
      </UiCardContent>
    </UiCard>

    <div v-else class="flex flex-col items-center gap-4">
      <UiSpinner class="h-10 w-10 text-primary" />
      <p class="text-muted-foreground">Verifying with Matrix Homeserver...</p>
    </div>
  </div>
</template>

<script setup lang="ts">

interface ErrorState {
  title: string;
  description: string;
}

const route = useRoute();
const router = useRouter();
const matrixStore = useMatrixStore();
const error = ref<ErrorState | null>(null);

const backOut = () => {
  navigateTo('/');
};

onMounted(async () => {
  try {
    // 1. Check for errors returned by the OIDC provider
    const errorParam = route.query.error as string;
    const errorDesc = route.query.error_description as string;

    if (errorParam) {
      throw new Error(errorDesc || errorParam);
    }

    // 2. Get authorization code and state
    const code = route.query.code as string;
    const state = route.query.state as string;

    if (!code || !state) {
      throw new Error("Missing authorization parameters from callback URL.");
    }

    // 3. Hand off to the Store to perform the SDK exchange
    // This replaces the $fetch call to /api/auth/callback
    await matrixStore.handleCallback(code, state);

    // 4. (Optional) Set a cookie for Nuxt Middleware
    // The SDK uses localStorage, but if you have route middleware checking cookies:
    const authCookie = useCookie('auth_token');
    // We assume the store has set the accessToken in state by now
    if (matrixStore.client?.getAccessToken()) {
       authCookie.value = matrixStore.client.getAccessToken();
    }

    // 5. Redirect to dashboard
    // Use replace to prevent the user from clicking "back" into the callback logic
    await navigateTo('/chat', { replace: true });

  } catch (err: any) {
    console.error('Authentication callback error:', err);

    error.value = {
      title: 'Authentication Error',
      description: err.message || 'Failed to complete authentication.',
    };
  }
});
</script>