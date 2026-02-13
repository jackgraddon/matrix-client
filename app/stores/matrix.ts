import * as sdk from 'matrix-js-sdk';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useMatrixStore = defineStore('matrix', () => {
  // Create an emtpy client and store it in a ref
  const client = ref<sdk.MatrixClient | null>(null);
  const isReady = ref(false);

  /**
   * Initialize the client using credentials saved in local storage.
   * This will be called when the application starts up.
   */

  async function initClient() {
    // Retrieve session data from local storage
    const accessToken = localStorage.getItem("matrix_access_token");
    const userId = localStorage.getItem("matrix_user_id");
    const deviceId = localStorage.getItem("matrix_device_id");
    const baseUrl = localStorage.getItem("matrix_base_url");

    // If session data is missing, wait for login
    if (!accessToken || !userId || !baseUrl) {
      console.log("[Matrix] Missing session data, waiting for login");
      return;
    }

    console.log("[Matrix] Found session data for user ", userId, " at ", baseUrl, ", initializing client");

    // Create the client
    client.value = sdk.createClient({
      baseUrl,
      accessToken,
      userId,
      deviceId: deviceId || undefined,
    });

    // Initialize Crypto (for end-to-end encryption)
    await client.value.initRustCrypto();

    // Start syncing
    await client.value.startClient();

    // Listen for activity to verify client is running
    client.value.on(sdk.ClientEvent.Sync, (state) => {
      if (state === 'PREPARED') {
        isReady.value = true;
        console.log("[Matrix] Client is ready");
      }
    })
  }

  /**
   * Finalize login by exchanging the login token for an access token
   */
  async function completeSsoLogin(baseUrl: string, loginToken: string) {
    // Create a temporary client to perform the exchange
    const tempClient = sdk.createClient({ baseUrl });

    try {
      // We use the type 'm.login.token' which is standard for SSO/MAS handoffs
      const response = await tempClient.loginRequest({
        type: 'm.login.token',
        token: loginToken,
      });

      // Save the PERMANENT credentials
      if (response.access_token && response.user_id && response.device_id) {
        localStorage.setItem('matrix_access_token', response.access_token);
        localStorage.setItem('matrix_user_id', response.user_id);
        localStorage.setItem('matrix_device_id', response.device_id);

        // Initialize the real client
        await initClient();
        return true;
      }
      return false;

    } catch (e) {
      console.error("[Matrix] Failed to exchange login token:", e);
      throw e;
    }
  }

  /** 
   * Initialize the client using credentials from the login form.
   * This will be called after the user submits the login form.
   */
  async function login(baseUrl: string, userId: string, accessToken: string) {
    // Save credentials to local storage
    localStorage.setItem("matrix_base_url", baseUrl);
    localStorage.setItem("matrix_user_id", userId);
    localStorage.setItem("matrix_access_token", accessToken);

    // Create the client
    client.value = sdk.createClient({
      baseUrl,
      accessToken,
      userId,
    });

    // Initialize Crypto (for end-to-end encryption)
    await client.value.initRustCrypto();

    // Start syncing
    await client.value.startClient();

    // Listen for activity to verify client is running
    client.value.on(sdk.ClientEvent.Sync, (state) => {
      if (state === 'PREPARED') {
        isReady.value = true;
        console.log("[Matrix] Client is ready");
      }
    })
  }

  /**
   * Logout the user and clear session data
   */
  async function logout() {
    // Clear session data
    localStorage.removeItem("matrix_base_url");
    localStorage.removeItem("matrix_user_id");
    localStorage.removeItem("matrix_access_token");
    localStorage.removeItem("matrix_device_id");

    // Stop the client
    await client.value?.stopClient();

    // Clear the client
    client.value = null;
    isReady.value = false;
  }

  return {
    client,
    isReady,
    initClient,
    login,
    completeSsoLogin,
    logout,
  }
});