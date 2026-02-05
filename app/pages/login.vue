<template>
  <div>
    <h1>Matrix Login</h1>

    <!-- Step 1: Enter Homeserver URL -->
    <div v-if="!flows">
      <label>
        Homeserver URL:
        <input v-model="homeserverUrl" type="text" />
      </label>
      <button @click="fetchFlows" :disabled="isLoading">
        {{ isLoading ? "Loading..." : "Next" }}
      </button>
      <p v-if="error" style="color: red">{{ error }}</p>
    </div>

    <!-- Step 2: Choose Login Method -->
    <div v-else>
      <p>Authentication Methods for {{ homeserverUrl }}</p>

      <!-- Password Login -->
      <div v-if="supportsPassword">
        <h2>Login with Password</h2>
        <form @submit.prevent="handlePasswordLogin">
          <div>
            <label>
              Username:
              <input v-model="username" type="text" required />
            </label>
          </div>
          <div>
            <label>
              Password:
              <input v-model="password" type="password" required />
            </label>
          </div>
          <button type="submit" :disabled="isLoading">
            {{ isLoading ? "Logging in..." : "Login" }}
          </button>
        </form>
      </div>

      <hr v-if="supportsPassword && supportsOidc" />

      <!-- SSO/OIDC Login -->
      <div v-if="supportsOidc">
        <h2>SSO / OIDC</h2>
        <button @click="handleOidcLogin" :disabled="isLoading">
          Login with SSO
        </button>
      </div>

      <div v-if="!supportsPassword && !supportsOidc">
        <p>No supported login flows found (Password or SSO/OIDC).</p>
      </div>
      
      <br />
      <button @click="reset">Back</button>
      <p v-if="error" style="color: red">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { createClient } from "matrix-js-sdk";
import { getOidcAuthUrl } from "@/utils/matrix-auth";

const config = useRuntimeConfig();

// State
const homeserverUrl = ref(config.public.matrix?.baseUrl ?? 'https://matrix.org');
const isLoading = ref(false);
const error = ref("");
const flows = ref<{ type: string }[] | null>(null);

const username = ref("");
const password = ref("");

// Derived state
const supportsPassword = computed(() => flows.value?.some((f) => f.type === "m.login.password"));
const supportsOidc = computed(() => 
  flows.value?.some((f) => f.type === "m.login.sso" || f.type === "m.login.oidc" || f.type === "org.matrix.login.oidc_v2")
);

// Actions
const fetchFlows = async () => {
  isLoading.value = true;
  error.value = "";
  flows.value = null;

  try {
    // Create a temporary client to query flows
    let baseUrl = homeserverUrl.value;
    if (baseUrl.startsWith('/')) {
        baseUrl = window.location.origin + baseUrl;
    }
    const tempClient = createClient({ baseUrl });
    const response = await tempClient.loginFlows();
    flows.value = response.flows;
  } catch (e: any) {
    console.error(e);
    error.value = "Failed to fetch login flows: " + (e.message || "Unknown error");
  } finally {
    isLoading.value = false;
  }
};

const handlePasswordLogin = async () => {
  isLoading.value = true;
  error.value = "";

  try {
    let baseUrl = homeserverUrl.value;
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
    let baseUrl = homeserverUrl.value;
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
