<template>
  <div class="flex items-center justify-center h-screen">
    <UiCard class="w-full sm:max-w-md">
      <UiCardHeader>
        <UiCardTitle>Matrix Login</UiCardTitle>
        <UiCardDescription>Please login to continue</UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <UiFieldGroup>
          <form v-if="!flows" @submit.prevent="fetchFlows">
            <UiFieldSet>
              <UiField>
                <UiFieldLabel>Homeserver URL</UiFieldLabel>
                <UiInputGroup>
                  <UiInputGroupInput placeholder="matrix.org" class="!pl-1" v-model="homeserverUrl" />
                  <UiInputGroupAddon>
                    <UiInputGroupText>https://</UiInputGroupText>
                  </UiInputGroupAddon>
                </UiInputGroup>
              </UiField>
              <UiButton type="submit" :disabled="isLoading">
                {{ isLoading ? "Loading..." : "Next" }}
              </UiButton>
              <UiAlert v-if="error" variant="destructive">
                <UiAlertTitle>Something went wrong.</UiAlertTitle>
                <UiAlertDescription>
                  <p>{{ error }}</p>
                </UiAlertDescription>
              </UiAlert>
            </UiFieldSet>
          </form>
          <form v-else @submit.prevent="handlePasswordLogin">
            <UiFieldSet>
              <UiFieldLegend>Authentication Methods</UiFieldLegend>
              <UiFieldGroup v-if="supportsPassword">
                <UiFieldDescription>Login with Password</UiFieldDescription>
                <UiFieldGroup>
                  <UiField>
                    <UiFieldLabel>Username</UiFieldLabel>
                    <UiInput v-model="username" type="text" required />
                  </UiField>
                  <UiField>
                    <UiFieldLabel>Password:</UiFieldLabel>
                    <UiInput v-model="password" type="password" required />
                  </UiField>
                </UiFieldGroup>
                <UiButton type="submit" :disabled="isLoading">
                  {{ isLoading ? "Logging in..." : "Login" }}
                </UiButton>
              </UiFieldGroup>
              <UiFieldSeparator v-if="supportsPassword && supportsOidc" />
              <UiFieldGroup v-if="supportsOidc">
                <UiFieldDescription>Login with SSO / OIDC</UiFieldDescription>
                <UiFieldGroup>
                  <UiField>
                    <UiButton @click="handleOidcLogin" :disabled="isLoading">
                      Login with SSO
                    </UiButton>
                  </UiField>
                </UiFieldGroup>
              </UiFieldGroup>

              <UiAlert v-if="!supportsPassword && !supportsOidc" variant="destructive">
                <UiAlertTitle>No supported login flows found.</UiAlertTitle>
                <UiAlertDescription>
                  <p>Neither a password or SSO/OIDC login flow was found. Please contact your administrator.</p>
                </UiAlertDescription>
              </UiAlert>
            
            <UiButton @click="reset" variant="outline">Back</UiButton>
            <p v-if="error" style="color: red">{{ error }}</p>
            </UiFieldSet>
          </form>
        </UiFieldGroup>
      </UiCardContent>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { getOidcAuthUrl } from "@/utils/matrix-auth";
import { createClient } from "matrix-js-sdk";

const config = useRuntimeConfig();

// State
const homeserverUrl = ref(config.public.matrix?.baseUrl ?? 'matrix.org');
const isLoading = ref(false);
const error = ref("");
const flows = ref<{ 
  type: string; 
  oauth_aware_preferred?: boolean; 
  "org.matrix.msc3824.delegated_oidc_compatibility"?: boolean; 
}[] | null>(null);

const username = ref("");
const password = ref("");

// Derived state
const supportsPassword = computed(() => {
  if (!flows.value) return false;
  const hasPassword = flows.value.some((f) => f.type === "m.login.password");
  const prefersOidc = flows.value.some((f) => f.oauth_aware_preferred && f["org.matrix.msc3824.delegated_oidc_compatibility"]);
  return hasPassword && !prefersOidc;
});
const supportsOidc = computed(() => 
  flows.value?.some((f) => f.type === "m.login.sso" || f.type === "m.login.oidc" || f.type === "org.matrix.login.oidc_v2")
);

// Actions
const fetchFlows = async () => {
  isLoading.value = true;
  error.value = "";
  flows.value = null;
  let isRedirecting = false;

  try {
    // Create a temporary client to query flows
    let baseUrl = ('https://' + homeserverUrl.value);
    if (baseUrl.startsWith('/')) {
        baseUrl = window.location.origin + baseUrl;
    }
    const tempClient = createClient({ baseUrl });
    const response = await tempClient.loginFlows();
    flows.value = response.flows;

    const prefersOidc = flows.value?.some((f) => f.oauth_aware_preferred && f["org.matrix.msc3824.delegated_oidc_compatibility"]);
    if (prefersOidc) {
      isRedirecting = true;
      await handleOidcLogin();
    }
  } catch (e: any) {
    console.error(e);
    error.value = "Failed to fetch login flows: " + (e.message || "Unknown error");
  } finally {
    if (!isRedirecting) {
      isLoading.value = false;
    }
  }
};

const handlePasswordLogin = async () => {
  isLoading.value = true;
  error.value = "";

  try {
    let baseUrl = 'https://' + homeserverUrl.value;
    if (baseUrl.startsWith('/')) {
        baseUrl = window.location.origin + baseUrl;
    }
    const client = createClient({ baseUrl });
    const result = await client.loginWithPassword(username.value, password.value);
    
    // Store credentials/tokens (simple local storage for now, or via store)
    localStorage.setItem("matrix_access_token", result.access_token);
    localStorage.setItem("matrix_user_id", result.user_id);
    localStorage.setItem("matrix_device_id", result.device_id);
    localStorage.setItem("matrix_base_url", homeserverUrl.value);

    // Redirect to home
    navigateTo("/");
  } catch (e: any) {
    console.error(e);
    error.value = "Login failed: " + (e.message || "Unknown error");
  } finally {
    isLoading.value = false;
  }
};

const handleOidcLogin = async () => {
  isLoading.value = true;
  error.value = "";

  try {
    // Use the utility for OIDC redirect
    let baseUrl = 'https://' + homeserverUrl.value;
    if (baseUrl.startsWith('/')) {
        baseUrl = window.location.origin + baseUrl;
    }
    const authUrl = await getOidcAuthUrl(baseUrl);
    window.location.href = authUrl;
  } catch (e: any) {
    console.error(e);
    error.value = "OIDC init failed: " + (e.message || "Unknown error");
    isLoading.value = false;
  }
};

const reset = () => {
  flows.value = null;
  error.value = "";
  homeserverUrl.value = "/api/matrix";
};
</script>
