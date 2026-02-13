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
      } catch (e) {
        console.error("Failed to fetch MXID:", e);
        throw new Error("Could not verify user identity.");
      }

      const deviceId = data.tokenResponse.device_id;

      // Persist Valid Credentials
      localStorage.setItem('matrix_access_token', accessToken);
      localStorage.setItem('matrix_refresh_token', refreshToken);
      localStorage.setItem('matrix_user_id', userId); // Now saving the correct MXID
      if (deviceId) localStorage.setItem('matrix_device_id', deviceId);

      // Initialize
      await this.initClient(accessToken, userId, deviceId, refreshToken);
    },

    async initClient(accessToken: string, userId: string, deviceId?: string, refreshToken?: string) {
      // FORCE RESTART: If a client exists, stop it. 
      // This allows 'handleCallback' to overwrite the 'bad' client started by the plugin.
      if (this.client) {
        console.log("Stopping existing Matrix client...");
        this.client.stopClient();
        this.client.removeAllListeners(); // Clean up listeners
      }

      console.log(`Initializing Client for ${userId}...`);

      this.client = sdk.createClient({
        baseUrl: getHomeserverUrl(),
        accessToken,
        userId,
        deviceId,
        refreshToken: refreshToken,
      });

      try {
        await this.client.initRustCrypto();
        console.log("Crypto initialized successfully");
      } catch (e) {
        console.warn("Crypto failed to initialize:", e);
      }

      await this.client.startClient();
      this.isAuthenticated = true;
      this.isSyncing = true;
    }
  }
});