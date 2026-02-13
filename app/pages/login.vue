<template>
  <div class="flex items-center justify-center h-screen">
    <UiCard class="w-full sm:max-w-md">
      <UiCardContent>
        <UiFieldGroup>
          <form v-if="flows.length === 0" @submit.prevent="handleLoginCheck">
            <UiFieldSet>
              <UiFieldLegend>Matrix Login</UiFieldLegend>
              <UiField>
                <UiFieldDescription>Please enter your homeserver URL to login with OIDC</UiFieldDescription>
                <UiInputGroup>
                  <UiInputGroupInput placeholder="matrix.org" class="!pl-1" v-model="homeserverDomain" />
                  <UiInputGroupAddon>
                    <UiInputGroupText>https://</UiInputGroupText>
                  </UiInputGroupAddon>
                </UiInputGroup>
              </UiField>
              <UiButton type="submit" :disabled="isLoading">
                {{ isLoading ? "Loading..." : "Login" }}
              </UiButton>
              <UiAlert v-if="error" variant="destructive">
                <UiAlertTitle>Something went wrong.</UiAlertTitle>
                <UiAlertDescription>
                  <p>{{ error }}</p>
                </UiAlertDescription>
              </UiAlert>
            </UiFieldSet>
          </form>
          <div v-else>
            <UiAlert variant="destructive">
              <UiAlertTitle>No supported login flows found.</UiAlertTitle>
              <UiAlertDescription>
                <p>Neither a password or SSO/OIDC login flow was found. Please contact your administrator.</p>
              </UiAlertDescription>
            </UiAlert>
            <UiButton @click="navigateTo('/login')" variant="outline" class="mt-4">Back</UiButton>
            <p v-if="error" style="color: red">{{ error }}</p>
          </div>
        </UiFieldGroup>
      </UiCardContent>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const config = useRuntimeConfig();

const router = useRouter();
const homeserverDomain = ref(config.public.matrix?.baseUrl.replace("https://", "") || "matrix.org");
const isLoading = ref(false);
const error = ref<string | null>(null);
const flows = ref<string[]>([]);

/**
 * Check if the homeserver supports OIDC login
 */
const handleLoginCheck = async () => {
  try {
    isLoading.value = true;
    error.value = null;

    if (!homeserverDomain.value.trim()) {
      error.value = 'Please enter a homeserver domain';
      return;
    }

    const baseUrl = `https://${homeserverDomain.value}`;

    // Check if server supports OIDC
    const response = await $fetch<{
      flows: Array<{ type: string }>;
      supportedOidc: boolean;
    }>('/api/auth/check', {
      method: 'POST',
      body: {
        baseUrl: baseUrl,
      },
    });

    if (!response.supportedOidc) {
      flows.value = response.flows.map((f) => f.type);
      error.value = 'This homeserver does not support OIDC login';
      return;
    }

    // Initiate OIDC login via top-level navigation to allow external redirect
    window.location.href = '/api/auth/login';
  } catch (err) {
    console.error('Login check failed:', err);
    error.value =
      err instanceof Error ? err.message : 'Failed to check homeserver configuration';
  } finally {
    isLoading.value = false;
  }
};
</script>