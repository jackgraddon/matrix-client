import { defineStore } from 'pinia';
import * as sdk from 'matrix-js-sdk';
import { getOidcConfig, registerClient, getLoginUrl, completeLoginFlow, getHomeserverUrl } from '~/utils/matrix-auth';

function generateNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export const useMatrixStore = defineStore('matrix', {
  state: () => ({
    client: null as sdk.MatrixClient | null,
    isAuthenticated: false,
    isSyncing: false,
    user: null as {
      userId: string;
      displayName?: string;
      avatarUrl?: string;
    } | null,
  }),
  actions: {
    async startLogin() {
      // CLEANUP: Remove old session data so the plugin doesn't try to auto-login when we land on the callback page.
      localStorage.removeItem('matrix_access_token');
      localStorage.removeItem('matrix_user_id');
      localStorage.removeItem('matrix_device_id');
      localStorage.removeItem('matrix_refresh_token');

      // Standard Flow
      const authConfig = await getOidcConfig();
      const clientId = await registerClient(authConfig);
      const nonce = generateNonce();

      localStorage.setItem('matrix_oidc_config', JSON.stringify(authConfig));
      localStorage.setItem('matrix_oidc_client_id', clientId);
      localStorage.setItem('matrix_oidc_nonce', nonce);

      const url = await getLoginUrl(authConfig, clientId, nonce);
      window.location.href = url;
    },

    async handleCallback(code: string, state: string) {
      // Exchange Code for Token
      const data = await completeLoginFlow(code, state);

      const accessToken = data.tokenResponse.access_token;
      const refreshToken = data.tokenResponse.refresh_token;

      // Fetch the real Matrix ID (MXID)
      const tempClient = sdk.createClient({
        baseUrl: getHomeserverUrl(),
        accessToken: accessToken
      });

      let userId: string;
      try {
        const whoami = await tempClient.whoami();
        userId = whoami.user_id;
        // whoami response often contains device_id 
        if (whoami.device_id) {
          // Overwrite the one from token response if present, or just use this one
        }
      } catch (e) {
        console.error("Failed to fetch MXID:", e);
        throw new Error("Could not verify user identity.");
      }

      const deviceId = (await tempClient.whoami()).device_id || data.tokenResponse.device_id;

      // Persist Valid Credentials
      localStorage.setItem('matrix_access_token', accessToken);
      localStorage.setItem('matrix_refresh_token', refreshToken);
      localStorage.setItem('matrix_user_id', userId); // Now saving the correct MXID
      if (deviceId) localStorage.setItem('matrix_device_id', deviceId);

      // Initialize
      await this.initClient(accessToken, userId, deviceId, refreshToken);
    },

    async initClient(accessToken: string, userId: string, deviceId?: string, refreshToken?: string) {
      console.log("Initializing Matrix Client...", { userId, deviceId, hasAccessToken: !!accessToken });

      // Force restart client
      if (this.client) {
        this.client.stopClient();
        this.client.removeAllListeners();
      }

      // Create new client
      this.client = sdk.createClient({
        baseUrl: getHomeserverUrl(),
        accessToken,
        userId,
        deviceId,
        refreshToken,
      });

      // Initialize crypto
      try {
        await this.client.initRustCrypto();
      } catch (e) {
        console.warn("Crypto failed to initialize:", e);
      }

      // Start client
      await this.client.startClient();
      this.isAuthenticated = true;
      this.isSyncing = true;

      // Fetch profile after login
      this.fetchUserProfile(userId);
    },

    // Action to get avatar and name
    async fetchUserProfile(userId: string) {
      if (!this.client) return;
      try {
        const profile = await this.client.getProfileInfo(userId);

        // Convert the mxc:// URL to a real HTTP URL
        let avatarUrl = undefined;
        if (profile.avatar_url) {
          avatarUrl = this.client.mxcUrlToHttp(profile.avatar_url, 96, 96, "crop");
        }

        // Update state
        this.user = {
          userId,
          displayName: profile.displayname,
          avatarUrl: avatarUrl || undefined
        };
      } catch (e) {
        console.error("Could not fetch profile:", e);
        this.user = { userId }; // Fallback
      }
    },

    // Reset the session and redirect to login
    async logout() {
      console.log("Logging out...");

      // Stop the Matrix Client (Kill Sync & Crypto)
      if (this.client) {
        this.client.stopClient();
        this.client.removeAllListeners();
      }

      // Clear Pinia State
      this.client = null;
      this.user = null;
      this.isAuthenticated = false;
      this.isSyncing = false;

      // Wipe Local Storage, remove critical session data
      localStorage.removeItem('matrix_access_token');
      localStorage.removeItem('matrix_refresh_token');
      localStorage.removeItem('matrix_user_id');
      localStorage.removeItem('matrix_device_id');

      // Remove OIDC data (forces fresh discovery/registration next time)
      localStorage.removeItem('matrix_oidc_config');
      localStorage.removeItem('matrix_oidc_client_id');
      localStorage.removeItem('matrix_oidc_nonce');

      // Redirect to landing page
      await navigateTo('/');
    }
  }
});