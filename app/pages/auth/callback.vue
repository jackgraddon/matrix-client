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
          <UiAlertTitle>{{ errorTitle }}</UiAlertTitle>
          <UiAlertDescription>
            <p>{{ errorDescription }}</p>
          </UiAlertDescription>
        </UiAlert>
        <UiButton @click="goToLogin" class="w-full">
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

<script lang="ts" setup>
import { completeOidcLogin } from "@/utils/matrix-auth";

const router = useRouter();
const route = useRoute();

const error = ref<string | null>(null);
const errorDescription = ref<string | null>(null);

const errorTitle = computed(() => {
  return error.value?.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Unknown Error';
});

const goToLogin = () => {
  router.push('/login');
};

onMounted(async () => {
  const query = route.query;
  
  if (query.error) {
    error.value = query.error as string;
    errorDescription.value = (query.error_description as string) || 'No details provided.';
    return;
  }

  const code = query.code as string;
  const state = query.state as string;
  
  if (code && state) {
    try {
      // Trade the code for an access_token
      const { tokenResponse, homeserverUrl, idTokenClaims } = await completeOidcLogin(code, state);
      
      // Verify we have a token
      if (tokenResponse.access_token) {
          localStorage.setItem("matrix_access_token", tokenResponse.access_token);
          
          // Extract device ID from scope if present
          if (tokenResponse.scope) {
              const scopeParts = tokenResponse.scope.split(' ');
              const deviceScope = scopeParts.find(s => s.startsWith('urn:matrix:org.matrix.msc2967.client:device:'));
              if (deviceScope) {
                  const deviceId = deviceScope.split(':').pop();
                  if (deviceId) {
                      localStorage.setItem("matrix_device_id", deviceId);
                  }
              }
          }

          // Fetch the real Matrix User ID (MXID)
          // OIDC 'sub' claim might be an opaque ID (like a ULID), not the @user:domain
          try {
              const whoamiRes = await fetch(`${homeserverUrl}/_matrix/client/v3/account/whoami`, {
                  headers: {
                      'Authorization': `Bearer ${tokenResponse.access_token}`
                  }
              });
              if (whoamiRes.ok) {
                  const data = await whoamiRes.json();
                  console.log("Fetched real MXID:", data.user_id);
                  localStorage.setItem("matrix_user_id", data.user_id);
              } else {
                  console.error("Failed to fetch MXID, falling back to sub claim:", idTokenClaims.sub);
                  localStorage.setItem("matrix_user_id", idTokenClaims.sub);
              }
          } catch (e) {
              console.error("Error fetching MXID:", e);
              localStorage.setItem("matrix_user_id", idTokenClaims.sub);
          }
      }
      
      if (homeserverUrl) {
         localStorage.setItem("matrix_homeserver_url", homeserverUrl);
      }

      // Force a reload to ensure the matrix plugin re-initializes with the new credentials
      window.location.assign('/');
    } catch (e: any) {
      console.error("Authentication failed:", e);
      error.value = "authentication_failed";
      errorDescription.value = e.message || "An unexpected error occurred during login verification.";
    }
  } else {
    // No code/state and no error param?
    error.value = "invalid_request";
    errorDescription.value = "Missing authentication parameters from the callback URL.";
  }
});
</script>