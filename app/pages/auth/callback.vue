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
        <UiButton @click="navigateTo('/login')" class="w-full">
          Return to Login
        </UiButton>
      </UiCardContent>
    </UiCard>

    <div v-else class="flex flex-col items-center gap-4">
      <UiSpinner size="lg" />
      <p class="text-muted-foreground">Completing authentication...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

interface ErrorState {
  title: string;
  description: string;
}

const router = useRouter();
const route = useRoute();
const error = ref<ErrorState | null>(null);

onMounted(async () => {
  try {
    // Get authorization code from URL query params
    const authorizationCode = route.query.code as string;
    const state = route.query.state as string;

    if (!authorizationCode) {
      // Check for error response from Matrix server
      const errorCode = route.query.error as string;
      const errorDescription = route.query.error_description as string;

      throw new Error(
        `Authorization failed: ${errorDescription || errorCode || 'Unknown error'}`
      );
    }

        // Exchange authorization code for tokens
    const response = await $fetch<{ accessToken: string; userId: string }>(
      '/api/auth/callback',
      {
        method: 'POST',
        body: {
          code: authorizationCode,
          state: state,
        },
      }
    );

    // Store authentication tokens
    const authToken = useCookie('auth_token');
    authToken.value = response.accessToken;

    // Redirect to dashboard or home page
    await navigateTo('/dashboard');
  } catch (err) {
    console.error('Authentication callback error:', err);

    error.value = {
      title: 'Authentication Error',
      description:
        err instanceof Error
          ? err.message
          : 'Failed to complete authentication. Please try again.',
    };
  }
});
</script>