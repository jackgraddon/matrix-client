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
    // ... startLogin remains the same ...
    async startLogin() {
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
      // 1. Exchange Code
      // FIX: The response is a wrapper object, not the token itself
      const data = await completeLoginFlow(code, state);

      // data structure: { tokenResponse: { access_token, refresh_token, ... }, ... }
      //
      const accessToken = data.tokenResponse.access_token;
      const refreshToken = data.tokenResponse.refresh_token; // CRITICAL
      const userId = data.idTokenClaims.sub || data.tokenResponse.user_id; // "sub" is standard OIDC user ID
      const deviceId = data.tokenResponse.device_id;

      // 2. Persist EVERYTHING
      localStorage.setItem('matrix_access_token', accessToken);
      localStorage.setItem('matrix_refresh_token', refreshToken); // Save this!
      localStorage.setItem('matrix_user_id', userId);
      if (deviceId) localStorage.setItem('matrix_device_id', deviceId);

      // 3. Initialize
      await this.initClient(accessToken, userId, deviceId, refreshToken);
    },

    async initClient(accessToken: string, userId: string, deviceId?: string, refreshToken?: string) {
      if (this.client) return;

      // 4. Create Client with Refresh Token
      this.client = sdk.createClient({
        baseUrl: getHomeserverUrl(),
        accessToken,
        userId,
        deviceId,
        refreshToken: refreshToken,
      });

      // 5. Initialize Crypto (Optional but Recommended)
      // If you don't do this, you can't read encrypted messages
      try {
        await this.client.initRustCrypto();
      } catch (e) {
        console.warn("Crypto failed to initialize:", e);
      }

      await this.client.startClient();
      this.isAuthenticated = true;
      this.isSyncing = true;
    }
  }
});