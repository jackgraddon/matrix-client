import { defineStore } from 'pinia';
import * as sdk from 'matrix-js-sdk';
import { OidcTokenRefresher } from 'matrix-js-sdk';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import { VerificationRequestEvent, VerificationPhase, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api/verification';
import type { VerificationRequest, Verifier, ShowSasCallbacks } from 'matrix-js-sdk/lib/crypto-api/verification';
import type { IdTokenClaims } from 'oidc-client-ts';
import { getOidcConfig, registerClient, getLoginUrl, completeLoginFlow, getHomeserverUrl } from '~/utils/matrix-auth';

/**
 * Subclass of OidcTokenRefresher that persists rotated tokens to localStorage.
 */
class LocalStorageOidcTokenRefresher extends OidcTokenRefresher {
  protected override async persistTokens(tokens: { accessToken: string; refreshToken?: string }): Promise<void> {
    localStorage.setItem('matrix_access_token', tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem('matrix_refresh_token', tokens.refreshToken);
    }
  }
}

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
    // Verification state
    isDeviceVerified: false,
    verificationRequest: null as VerificationRequest | null,
    verificationInitiatedByMe: false,
    sasEvent: null as ShowSasCallbacks | null,
    isVerificationCompleted: false,
  }),
  actions: {
    async startLogin() {
      // Stop any existing client to release DB locks
      if (this.client) {
        this.client.stopClient();
        this.client.removeAllListeners();
        this.client = null;
      }

      // CLEANUP: Remove old session data so the plugin doesn't try to auto-login when we land on the callback page.
      localStorage.removeItem('matrix_access_token');
      localStorage.removeItem('matrix_user_id');
      localStorage.removeItem('matrix_device_id');
      localStorage.removeItem('matrix_refresh_token');
      // Clear stale crypto store so a new device ID doesn't conflict
      await this._clearCryptoStore();

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

      const deviceId = (await tempClient.whoami()).device_id || data.tokenResponse.device_id;

      // Persist Valid Credentials
      localStorage.setItem('matrix_access_token', accessToken);
      localStorage.setItem('matrix_refresh_token', refreshToken);
      localStorage.setItem('matrix_user_id', userId);
      if (deviceId) localStorage.setItem('matrix_device_id', deviceId);

      // Persist OIDC session data needed for token refresh on reload
      const issuer = data.oidcClientSettings.issuer;
      const clientId = data.oidcClientSettings.clientId;
      const idTokenClaims = data.idTokenClaims;

      localStorage.setItem('matrix_oidc_issuer', issuer);
      localStorage.setItem('matrix_oidc_id_token_claims', JSON.stringify(idTokenClaims));
      // clientId is already stored as matrix_oidc_client_id from startLogin

      // Initialize
      await this.initClient(accessToken, userId, deviceId, refreshToken, issuer, clientId, idTokenClaims);
    },

    async initClient(
      accessToken: string,
      userId: string,
      deviceId?: string,
      refreshToken?: string,
      issuer?: string,
      clientId?: string,
      idTokenClaims?: IdTokenClaims,
    ) {
      console.log("Initializing Matrix Client...", { userId, deviceId, hasAccessToken: !!accessToken });

      // Force restart client
      if (this.client) {
        this.client.stopClient();
        this.client.removeAllListeners();
      }

      // Build tokenRefreshFunction when we have full OIDC context
      let tokenRefreshFunction: sdk.TokenRefreshFunction | undefined;
      if (refreshToken && issuer && clientId && idTokenClaims && deviceId) {
        const redirectUri = window.location.origin + '/auth/callback';
        const refresher = new LocalStorageOidcTokenRefresher(issuer, clientId, redirectUri, deviceId, idTokenClaims);

        tokenRefreshFunction = refresher.doRefreshAccessToken.bind(refresher);
        console.log('OIDC token refresh function configured.');
      } else if (refreshToken) {
        console.warn('Refresh token present but missing OIDC metadata — token refresh will not work.');
      }

      // Create new client
      this.client = sdk.createClient({
        baseUrl: getHomeserverUrl(),
        accessToken,
        userId,
        deviceId,
        refreshToken,
        tokenRefreshFunction,
        cryptoStore: new sdk.IndexedDBCryptoStore(window.indexedDB, "matrix-js-sdk-crypto")
      });

      // Initialize crypto
      let cryptoReady = false;
      try {
        await this.client.initRustCrypto();
        cryptoReady = !!this.client.getCrypto();
        console.log('Crypto initialized:', cryptoReady);
      } catch (e: any) {
        const msg = e?.message || '';
        if (msg.includes("account in the store doesn't match")) {
          console.warn('Crypto store has stale device data — clearing and retrying...');
          // Stop the current client to release the IndexedDB connection
          if (this.client) {
            this.client.stopClient();
            this.client.removeAllListeners();
            this.client = null;
          }

          // Brief pause to ensure DB lock is released
          await new Promise(resolve => setTimeout(resolve, 100));

          // Delete the stale Rust crypto IndexedDB databases
          const deleteDb = (name: string) => new Promise<void>((resolve) => {
            const req = window.indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => { console.warn(`IndexedDB delete blocked: ${name}`); resolve(); };
          });
          await deleteDb('matrix-js-sdk::matrix-sdk-crypto');
          await deleteDb('matrix-js-sdk::matrix-sdk-crypto-meta');
          // Recreate the client with a fresh crypto store
          this.client = sdk.createClient({
            baseUrl: getHomeserverUrl(),
            accessToken,
            userId,
            deviceId,
            refreshToken,
            tokenRefreshFunction,
            cryptoStore: new sdk.IndexedDBCryptoStore(window.indexedDB, 'matrix-js-sdk-crypto'),
          });
          // Retry init
          try {
            await this.client.initRustCrypto();
            cryptoReady = !!this.client.getCrypto();
            console.log('Crypto initialized after store reset:', cryptoReady);
          } catch (retryErr) {
            console.error('Crypto failed to initialize after reset:', retryErr);
          }
        } else {
          console.warn("Crypto failed to initialize:", e);
        }
      }

      // Start client
      await this.client.startClient();
      this.isAuthenticated = true;
      this.isSyncing = true;

      if (cryptoReady) {
        // Listen for incoming verification requests from other devices
        this.client.on(CryptoEvent.VerificationRequestReceived, (request: VerificationRequest) => {
          if (request.isSelfVerification) {
            this.verificationRequest = request;
            this.verificationInitiatedByMe = false;
            this._setupVerificationListeners(request);
          }
        });

        // Check if this device is already verified
        this.checkDeviceVerified();
      }

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

    // --- Verification Actions ---

    async requestVerification() {
      const crypto = this.client?.getCrypto();
      if (!crypto) { console.error('Crypto not available'); return; }

      try {
        const request = await crypto.requestOwnUserVerification();
        this.verificationRequest = request;
        this.verificationInitiatedByMe = true;
        this.isVerificationCompleted = false;
        this.sasEvent = null;
        this._setupVerificationListeners(request);
      } catch (e) {
        console.error('Failed to request verification:', e);
      }
    },

    _setupVerificationListeners(request: VerificationRequest) {
      request.on(VerificationRequestEvent.Change, async () => {
        const phase = request.phase;
        console.log('Verification phase:', phase);

        if (phase === VerificationPhase.Ready) {
          // Other device accepted — start SAS
          if (request.methods.includes('m.sas.v1')) {
            const verifier = await request.startVerification('m.sas.v1');
            this._setupVerifierListeners(verifier);
          }
        } else if (phase === VerificationPhase.Started) {
          // If the other side started the verification, we get a verifier here
          const verifier = request.verifier;
          if (verifier) {
            this._setupVerifierListeners(verifier);
          }
        } else if (phase === VerificationPhase.Done) {
          this.isVerificationCompleted = true;
          this.sasEvent = null;
          await this.checkDeviceVerified();
          // Auto-dismiss after a short delay
          setTimeout(() => this._resetVerificationState(), 3000);
        } else if (phase === VerificationPhase.Cancelled) {
          console.warn('Verification cancelled');
          this._resetVerificationState();
        }
      });
    },

    _setupVerifierListeners(verifier: Verifier) {
      verifier.on(VerifierEvent.ShowSas, (sas: ShowSasCallbacks) => {
        console.log('SAS emojis:', sas.sas.emoji);
        this.sasEvent = sas;
      });

      verifier.on(VerifierEvent.Cancel, () => {
        console.warn('Verifier cancelled');
        this._resetVerificationState();
      });

      // Kick off the verification exchange
      verifier.verify().catch((e) => {
        console.error('Verification failed:', e);
        this._resetVerificationState();
      });
    },

    async acceptVerification() {
      if (!this.verificationRequest) return;
      try {
        await this.verificationRequest.accept();
      } catch (e) {
        console.error('Failed to accept verification:', e);
      }
    },

    async confirmSasMatch() {
      if (!this.sasEvent) return;
      try {
        await this.sasEvent.confirm();
      } catch (e) {
        console.error('Failed to confirm SAS:', e);
      }
    },

    async cancelVerification() {
      if (this.verificationRequest) {
        try {
          await this.verificationRequest.cancel();
        } catch (e) {
          console.error('Failed to cancel verification:', e);
        }
      }
      this._resetVerificationState();
    },

    async checkDeviceVerified() {
      const crypto = this.client?.getCrypto();
      if (!crypto) return;
      const userId = this.client?.getUserId();
      const deviceId = this.client?.getDeviceId();
      if (!userId || !deviceId) return;
      try {
        const status = await crypto.getDeviceVerificationStatus(userId, deviceId);
        this.isDeviceVerified = status?.isVerified() ?? false;
      } catch (e) {
        console.error('Failed to check device verification:', e);
      }
    },

    _resetVerificationState() {
      this.verificationRequest = null;
      this.verificationInitiatedByMe = false;
      this.sasEvent = null;
      this.isVerificationCompleted = false;
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
      localStorage.removeItem('matrix_oidc_issuer');
      localStorage.removeItem('matrix_oidc_id_token_claims');

      // Clear crypto store
      await this._clearCryptoStore();

      // Redirect to landing page
      await navigateTo('/');
    },

    async _clearCryptoStore() {
      const deleteDb = (name: string) => new Promise<void>((resolve) => {
        const req = window.indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => { console.warn(`DB delete blocked: ${name}`); resolve(); };
      });
      await deleteDb('matrix-js-sdk::matrix-sdk-crypto');
      await deleteDb('matrix-js-sdk::matrix-sdk-crypto-meta');
    },
  }
});