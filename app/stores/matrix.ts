import { defineStore } from 'pinia';
import { toast } from 'vue-sonner';
import * as sdk from 'matrix-js-sdk';
import { OidcTokenRefresher } from 'matrix-js-sdk';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import { VerificationRequestEvent, VerificationPhase, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api/verification';
import type { VerificationRequest, Verifier, ShowSasCallbacks } from 'matrix-js-sdk/lib/crypto-api/verification';
import { deriveRecoveryKeyFromPassphrase } from 'matrix-js-sdk/lib/crypto-api/key-passphrase';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key';
import type { IdTokenClaims } from 'oidc-client-ts';
import { getOidcConfig, registerClient, getLoginUrl, completeLoginFlow, getHomeserverUrl } from '~/utils/matrix-auth';
// Tauri imports - explicit import is required as per user confirmation/config check
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { MsgType, EventType } from 'matrix-js-sdk';

// Enhanced HTML for OAuth Loopback Response
const authResponseHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"> <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #111; color: #eee; }
    .card { text-align: center; padding: 2rem; border-radius: 12px; background: #222; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 1px solid #333; max-width: 400px; width: 100%; }
    .success { color: #10b981; }
    .error { color: #ef4444; }
    .hidden { display: none !important; }
    p { color: #aaa; line-height: 1.5; }
    .small { color: #666; font-size: 0.875rem; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card hidden" id="success-card">
    <h1 class="success">Login Successful</h1>
    <p>You can close this tab and return to the app.</p>
    <p class="small">This tab will close automatically...</p>
  </div>
  
  <div class="card hidden" id="error-card">
    <h1 class="error">Authentication Failed</h1>
    <p id="error-msg">Access was denied.</p>
    <p class="small">You can close this tab and try again in the app.</p>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const successCard = document.getElementById('success-card');
    const errorCard = document.getElementById('error-card');
    const errorMsg = document.getElementById('error-msg');
    
    // Check if the URL contains an error parameter
    if (params.has('error')) {
      errorCard.classList.remove('hidden');
      
      // Make the error readable (e.g., 'access_denied' -> 'access denied')
      const rawError = params.get('error').replace(/_/g, ' ');
      const desc = params.get('error_description');
      
      errorMsg.textContent = desc ? desc : "Error: " + rawError;
    } else {
      // Show success and attempt to auto-close
      successCard.classList.remove('hidden');
      setTimeout(() => window.close(), 3000);
    }
  </script>
</body>
</html>
`;

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
    isClientReady: false,
    user: null as {
      userId: string;
      displayName?: string;
      avatarUrl?: string;
    } | null,
    // Verification state
    isCrossSigningReady: false,
    isSecretStorageReady: false,
    verificationRequest: null as VerificationRequest | null,
    verificationInitiatedByMe: false,
    sasEvent: null as ShowSasCallbacks | null,
    isVerificationCompleted: false,
    verificationModalOpen: false,
    // Secret Storage / Backup Code Verification
    secretStoragePrompt: null as {
      promise: { resolve: (val: [string, Uint8Array<ArrayBuffer>] | null) => void, reject: (err?: any) => void },
      keyId: string,
      keyInfo: any // SecretStorageKeyDescription
    } | null,
    secretStorageKeyCache: {} as Record<string, Uint8Array<ArrayBuffer>>,
    // Activity Status (Game Detection)
    activityStatus: null as string | null,
    activityDetails: null as { name: string; is_running: boolean } | null,
    isGameDetectionEnabled: false,

    customStatus: null as string | null,
    isLoggingIn: false,
  }),
  actions: {
    initGameDetection() {
      // Check if localStorage has "game_activity_enabled"
      const stored = localStorage.getItem('game_activity_enabled');
      console.log('[MatrixStore] Loading game detection config:', stored);
      this.isGameDetectionEnabled = stored === 'true';
      // Sync with backend immediately if supported
      const tauriCheck = !!(window as any).__TAURI_INTERNALS__;
      console.log('[MatrixStore] Syncing with backend. Tauri detected:', tauriCheck);
      if (tauriCheck) {
        invoke('set_scanner_enabled', { enabled: this.isGameDetectionEnabled })
          .then(() => console.log('[MatrixStore] Backend sync success'))
          .catch((e: any) => console.error('[MatrixStore] Failed to sync scanner state:', e));
      } else {
        console.warn('[MatrixStore] Tauri not detected, skipping backend sync');
      }
    },

    async setGameDetection(enabled: boolean) {
      console.log('[MatrixStore] Setting game detection:', enabled);
      this.isGameDetectionEnabled = enabled;
      localStorage.setItem('game_activity_enabled', String(enabled));

      const tauriCheck = !!(window as any).__TAURI_INTERNALS__;
      console.log('[MatrixStore] Invoking set_scanner_enabled. Tauri detected:', tauriCheck);

      if (tauriCheck) {
        try {
          await invoke('set_scanner_enabled', { enabled });
          console.log('[MatrixStore] Toggle command sent successfully');
          if (!enabled) {
            // Clear status immediately when disabled
            this.activityStatus = null;
            this.activityDetails = null;
            this.setCustomStatus(this.customStatus); // Refresh presence without game
          }
        } catch (e) {
          console.error('[MatrixStore] Failed to toggle scanner:', e);
        }
      }
    },

    async bindGameActivityListener() {
      if (!(window as any).__TAURI_INTERNALS__) return;

      console.log('[MatrixStore] Binding game activity listener...');
      try {
        // Load game list first
        try {
          const res = await fetch('https://discord.com/api/v9/applications/detectable');
          if (res.ok) {
            const allGames = await res.json();
            const platform = navigator.platform.toLowerCase();
            const os = platform.includes('mac') ? 'darwin' : (platform.includes('win') ? 'win32' : 'linux');

            // Include native OS executables + win32 (for Proton/CrossOver/Wine games)
            const matchOs = [os, ...(os !== 'win32' ? ['win32'] : [])];

            const filtered = allGames
              .filter((g: any) => g.executables?.some((e: any) => matchOs.includes(e.os)))
              .map((g: any) => ({
                id: g.id,
                name: g.name,
                executables: g.executables.filter((e: any) => matchOs.includes(e.os)),
              }));

            // Add fake game for testing
            filtered.push({
              id: '99999',
              name: 'Calculator',
              executables: [{ os: 'darwin', name: 'Calculator' }]
            });

            await invoke('update_watch_list', { games: filtered });
          }
        } catch (e) {
          console.error('[MatrixStore] Failed to load/send game list:', e);
        }

        // Listen for events
        await listen<{ name: string; is_running: boolean }>('game-activity', (event) => {
          const { name, is_running } = event.payload;
          console.log('[MatrixStore] Game Activity Event:', name, is_running);

          if (is_running) {
            this.activityDetails = { name, is_running };
            // Only update presence if no custom status is set
            if (!this.customStatus) {
              this.client?.setPresence({
                presence: 'online',
                status_msg: `Playing ${name}`
              });
            }
          } else {
            // Game stopped
            if (this.activityDetails?.name === name) {
              this.activityDetails = null;
              if (!this.customStatus) {
                this.client?.setPresence({
                  presence: 'online',
                  status_msg: ''
                });
              }
            }
          }
        });
      } catch (e) {
        console.error('[MatrixStore] Failed to bind listener:', e);
      }
    },

    setCustomStatus(status: string | null) {
      this.customStatus = status;
      // If we set a custom status, push it to Matrix immediately
      if (this.client && this.isClientReady) {
        this.client.setPresence({
          presence: 'online',
          status_msg: status || (this.activityDetails?.is_running ? `Playing ${this.activityDetails.name}` : '')
        });
      }
    },

    cancelLogin(errorReason?: string | null) {
      this.isLoggingIn = false;

      let friendlyMessage = "The authentication process was cancelled.";

      if (errorReason === 'access_denied') {
        friendlyMessage = "Access to the homeserver was denied.";
      } else if (errorReason) {
        // Clean up snake_case errors like 'invalid_request' -> 'invalid request'
        friendlyMessage = `Authentication failed: ${errorReason.replace(/_/g, ' ')}`;
      }

      toast.error('Login Cancelled', {
        description: friendlyMessage,
        duration: 5000,
      });

      const router = useRouter();
      if (router.currentRoute.value.path !== '/login') {
        router.push('/login');
      }
    },

    async startLogin(homeserverUrl: string) {
      this.isLoggingIn = true;
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

      const isTauri = !!(window as any).__TAURI_INTERNALS__;

      if (isTauri) {
        // --- Loopback OAuth Flow (Desktop) ---
        // Use tauri-plugin-oauth to spawn a local HTTP server on a random port.
        // The OIDC provider redirects the system browser to http://127.0.0.1:<port>
        // and the plugin fires an event with the full URL.
        const { start, cancel, onUrl } = await import('@fabianlars/tauri-plugin-oauth');

        // Start the loopback server with a branded response page
        const port = await start({
          ports: [12345, 12346, 12347, 12348, 12349],
          response: authResponseHtml,
        });

        // Listen for the redirect URL from the OIDC provider
        const unlisten = await onUrl(async (url: string) => {
          try {
            const parsed = new URL(url);
            const code = parsed.searchParams.get('code');
            const state = parsed.searchParams.get('state');
            const error = parsed.searchParams.get('error');

            if (error) {
              console.error("OAuth flow failed or was cancelled:", error);
              this.cancelLogin(error);
            } else if (code && state) {
              await this.handleCallback(code, state);
              await navigateTo('/chat', { replace: true });
            } else {
              console.error('[OAuth Loopback] Missing code or state in callback URL:', url);
              this.cancelLogin('missing_credentials');
            }
          } catch (err: any) {
            console.error('[OAuth Loopback] Callback handling failed:', err);
            this.cancelLogin(err?.message || 'callback_failed');
          } finally {
            // Clean up: stop listening and shut down the temporary server
            unlisten();
            await cancel(port);
          }
        });

        const redirectUri = `http://127.0.0.1:${port}`;
        localStorage.setItem('matrix_oidc_redirect_uri', redirectUri);

        const authConfig = await getOidcConfig(homeserverUrl);
        const clientId = await registerClient(authConfig, redirectUri);
        const nonce = generateNonce();

        localStorage.setItem('matrix_oidc_config', JSON.stringify(authConfig));
        localStorage.setItem('matrix_oidc_client_id', clientId);
        localStorage.setItem('matrix_oidc_nonce', nonce);

        const loginUrl = await getLoginUrl(authConfig, clientId, nonce, redirectUri, homeserverUrl);

        // Open the system browser (not the webview)
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(loginUrl);

      } else {
        // --- Standard Web/PWA Flow ---
        const authConfig = await getOidcConfig(homeserverUrl);
        const clientId = await registerClient(authConfig);
        const nonce = generateNonce();

        localStorage.setItem('matrix_oidc_config', JSON.stringify(authConfig));
        localStorage.setItem('matrix_oidc_client_id', clientId);
        localStorage.setItem('matrix_oidc_nonce', nonce);
        localStorage.setItem('matrix_oidc_redirect_uri', window.location.origin + '/auth/callback');

        const url = await getLoginUrl(authConfig, clientId, nonce, undefined, homeserverUrl);
        window.location.href = url;
      }
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
        const redirectUri = localStorage.getItem('matrix_oidc_redirect_uri') || window.location.origin + '/auth/callback';
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
        cryptoStore: new sdk.IndexedDBCryptoStore(window.indexedDB, "matrix-js-sdk-crypto"),
        cryptoCallbacks: {
          getSecretStorageKey: async ({ keys }, name) => {
            console.log(`getSecretStorageKey called for ${name}`, keys);

            for (const keyId of Object.keys(keys)) {
              if (this.secretStorageKeyCache[keyId]) {
                return [keyId, this.secretStorageKeyCache[keyId]];
              }
            }

            return new Promise<[string, Uint8Array<ArrayBuffer>] | null>((resolve, reject) => {
              const keyId = Object.keys(keys)[0];
              if (!keyId) {
                // Should not happen if keys are requested properly, but handle it safely
                resolve(null);
                return;
              }
              const keyInfo = keys[keyId];

              this.secretStoragePrompt = {
                promise: { resolve, reject },
                keyId,
                keyInfo
              };
            });
          }
        }
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
            cryptoCallbacks: {
              getSecretStorageKey: async ({ keys }, name) => {
                for (const keyId of Object.keys(keys)) {
                  if (this.secretStorageKeyCache[keyId]) {
                    return [keyId, this.secretStorageKeyCache[keyId]];
                  }
                }
                return new Promise<[string, Uint8Array<ArrayBuffer>] | null>((resolve, reject) => {
                  const keyId = Object.keys(keys)[0];
                  if (!keyId) {
                    resolve(null);
                    return;
                  }
                  const keyInfo = keys[keyId];
                  this.secretStoragePrompt = { promise: { resolve, reject }, keyId, keyInfo };
                });
              }
            }
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

      this.client.on(sdk.ClientEvent.Sync, (state: sdk.SyncState) => {
        this.isSyncing = state === sdk.SyncState.Syncing || state === sdk.SyncState.Prepared;
        if (state === sdk.SyncState.Prepared) {
          this.isClientReady = true;
          // Optional: Trigger a fresh presence update now that we are ready
          if (this.activityDetails?.is_running) {
            this.client?.setPresence({ presence: 'online', status_msg: `Playing ${this.activityDetails.name}` });
          }
        }
      });

      if (cryptoReady) {
        // Listen for incoming verification requests from other devices
        this.client.on(CryptoEvent.VerificationRequestReceived, (request: VerificationRequest) => {
          if (request.isSelfVerification) {
            this.verificationRequest = request;
            this.verificationInitiatedByMe = false;
            this._setupVerificationListeners(request);
          }
        });

        // Listen for security status changes to update UI in real-time
        this.client.on(CryptoEvent.KeysChanged, () => this.checkDeviceVerified());
        this.client.on(CryptoEvent.UserTrustStatusChanged, () => this.checkDeviceVerified());

        // Check if this device is already verified (initial check)
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

        // Store the mxc:// URL directly
        let avatarUrl = profile.avatar_url;

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



    async submitSecretStorageKey(input: string) {
      if (!this.secretStoragePrompt) return;

      const { promise, keyId, keyInfo } = this.secretStoragePrompt;

      try {
        let keyArray: Uint8Array<ArrayBuffer>;

        // Try to decode as Recovery Key (Base58)
        const cleanInput = input.replace(/\s/g, '');
        let isRecoveryKey = false;
        try {
          const decoded = decodeRecoveryKey(cleanInput);
          // Ensure type is Uint8Array<ArrayBuffer>
          keyArray = new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength) as Uint8Array<ArrayBuffer>;
          isRecoveryKey = true;
        } catch (e) {
          // Not a valid recovery key, assume passphrase
        }

        if (!isRecoveryKey) {
          if (keyInfo.passphrase) {
            const derived = await deriveRecoveryKeyFromPassphrase(
              input,
              keyInfo.passphrase.salt,
              keyInfo.passphrase.iterations
            );
            // Ensure type is Uint8Array<ArrayBuffer>
            keyArray = new Uint8Array(derived.buffer, derived.byteOffset, derived.byteLength) as Uint8Array<ArrayBuffer>;
          } else {
            throw new Error("Input is not a valid recovery key and no passphrase info available.");
          }
        }

        // Cache and resolve
        this.secretStorageKeyCache[keyId] = keyArray!;
        promise.resolve([keyId, keyArray!]);
        this.secretStoragePrompt = null;

      } catch (e) {
        console.error("Failed to process secret storage key:", e);
        // We could reject, but maybe we want to let the user try again?
        // For now, let's keep the prompt open but log error.
        // To close it:
        // promise.reject(e);
        // this.secretStoragePrompt = null;
      }
    },

    cancelSecretStorageKey() {
      if (this.secretStoragePrompt) {
        this.secretStoragePrompt.promise.resolve(null); // Return null to indicate cancellation/skipping
        this.secretStoragePrompt = null;
      }
    },

    async requestVerification() {
      this.verificationModalOpen = true; // Ensure modal opens

      const crypto = this.client?.getCrypto();
      if (!crypto) { console.error('Crypto not available'); return; }

      try {
        // Cancel any existing request first to avoid conflicts
        if (this.verificationRequest) {
          try {
            await this.verificationRequest.cancel();
          } catch (e) {
            console.warn("Failed to cancel previous verification request:", e);
          }
          this.verificationRequest = null;
        }

        // Set state immediately to show "Waiting..." UI instead of "Incoming Request"
        this.verificationInitiatedByMe = true;
        this.isVerificationCompleted = false;
        this.sasEvent = null;

        const request = await crypto.requestOwnUserVerification();
        this.verificationRequest = request;
        this._setupVerificationListeners(request);
      } catch (e) {
        console.error('Failed to request verification:', e);
        // Reset if failed so we don't get stuck in "Waiting..."
        this.verificationInitiatedByMe = false;
        this.verificationModalOpen = false;
      }
    },

    openVerificationModal() {
      this.verificationModalOpen = true;
    },

    closeVerificationModal() {
      this.verificationModalOpen = false;
      if (!this.verificationRequest && !this.isVerificationCompleted) {
        // Only reset if we aren't in the middle of something or just finished
        this._resetVerificationState();
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

          // Pull keys after verification success
          await this.restoreKeysFromBackup();
          await this.retryDecryption();

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
        const wasReady = this.isCrossSigningReady;

        // Refresh security status
        this.isCrossSigningReady = await crypto.isCrossSigningReady();
        this.isSecretStorageReady = await crypto.isSecretStorageReady();

        console.log('[Verification] Status:', {
          crossSigningReady: this.isCrossSigningReady,
          secretStorageReady: this.isSecretStorageReady
        });

        // If we just became verified/ready, attempt to decrypt any blocked messages
        if (!wasReady && this.isCrossSigningReady) {
          console.log('[Verification] Cross-signing is now ready. Triggering re-decryption...');
          // Don't await this, let it run in background so UI updates immediately
          this.retryDecryption();
        }
      } catch (e) {
        console.error('Failed to check device verification:', e);
      }
    },

    // --- File Upload ---

    async uploadFile(roomId: string, file: File) {
      if (!this.client) return;

      const isEncrypted = this.client.isRoomEncrypted(roomId);
      let contentUrl: string | undefined;
      let encryptedFile: any = undefined;

      // Determine message type
      let msgType = MsgType.File;
      if (file.type.startsWith('image/')) msgType = MsgType.Image;
      else if (file.type.startsWith('video/')) msgType = MsgType.Video;
      else if (file.type.startsWith('audio/')) msgType = MsgType.Audio;

      // Extract image dimensions if possible
      let info: any = {
        size: file.size,
        mimetype: file.type,
      };

      if (msgType === MsgType.Image) {
        try {
          const dims = await this._getImageDimensions(file);
          info.w = dims.w;
          info.h = dims.h;
        } catch (e) {
          console.warn('Failed to get image dimensions', e);
        }
      }

      if (isEncrypted) {
        // Encrypt
        const data = await file.arrayBuffer();
        const encryptionResult = await this._encryptAttachment(data);

        // Upload ciphertext
        const blob = new Blob([encryptionResult.data], { type: 'application/octet-stream' });
        const response = await this.client.uploadContent(blob, {
          type: 'application/octet-stream',
        });

        encryptedFile = {
          ...encryptionResult.info,
          url: response.content_uri,
          mimetype: file.type, // Spec says mimetype should be here too
        };
      } else {
        // Plaintext
        const response = await this.client.uploadContent(file);
        contentUrl = response.content_uri;
      }

      // Construct content
      const content: any = {
        body: file.name || 'Attachment',
        msgtype: msgType,
        info,
      };

      if (isEncrypted) {
        content.file = encryptedFile;
      } else {
        content.url = contentUrl!;
      }

      await this.client.sendEvent(roomId, EventType.RoomMessage, content);
    },

    async _encryptAttachment(data: ArrayBuffer) {
      // 1. Generate 32-byte AES-CTR key
      const keyFn = await window.crypto.subtle.generateKey(
        { name: 'AES-CTR', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const exportedKey = await window.crypto.subtle.exportKey('jwk', keyFn);

      // Generate IV (Counter Block)
      const iv = window.crypto.getRandomValues(new Uint8Array(16));
      if (iv[8]) iv[8] &= 0x7f;

      // Encrypt
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: iv, length: 64 },
        keyFn,
        data
      );

      // SHA-256 hash
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', ciphertext);

      return {
        data: ciphertext,
        info: {
          v: 'v2',
          key: {
            alg: 'A256CTR',
            k: exportedKey.k!,
            ext: true,
            key_ops: ['encrypt', 'decrypt'],
            kty: 'oct'
          },
          iv: sdk.encodeBase64(iv),
          hashes: {
            sha256: sdk.encodeUnpaddedBase64(new Uint8Array(hashBuffer))
          }
        }
      };
    },

    _getImageDimensions(file: File): Promise<{ w: number, h: number }> {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
          URL.revokeObjectURL(url);
        };
        img.onerror = reject;
        img.src = url;
      });
    },

    _resetVerificationState() {
      this.verificationRequest = null;
      this.verificationInitiatedByMe = false;
      this.sasEvent = null;
      this.isVerificationCompleted = false;
      this.verificationModalOpen = false;
    },

    async bootstrapVerification() {
      if (!this.client) return;
      const crypto = this.client.getCrypto();
      if (!crypto) return;

      try {
        console.log("Bootstrapping verification and secret storage...");

        // 1. Bootstrap Cross-Signing (find or create keys)
        await crypto.bootstrapCrossSigning({
          setupNewCrossSigning: false
        });

        // 2. Bootstrap Secret Storage (ensure we have access to secrets)
        await crypto.bootstrapSecretStorage({
          setupNewSecretStorage: false
        });

        // 3. Try to load historical backup keys if they exist
        await this.restoreKeysFromBackup();
        await this.retryDecryption();

        await this.checkDeviceVerified();

        if (this.isCrossSigningReady) {
          this.isVerificationCompleted = true;
          this.verificationModalOpen = true; // Stay open to show success
          setTimeout(() => this._resetVerificationState(), 3000);
        }
      } catch (e) {
        console.error("Bootstrap failed:", e);
      }
    },

    async restoreKeysFromBackup() {
      if (!this.client) return;
      const crypto = this.client.getCrypto();
      if (!crypto) return;

      console.log("Checking for historical key backups...");
      try {
        const backupInfo = await crypto.getKeyBackupInfo();
        if (backupInfo) {
          await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
          await crypto.restoreKeyBackup({
            progressCallback: (p) => {
              if (p.stage === 'load_keys') {
                console.log(`Restoring keys: ${p.successes}/${p.total}`);
              }
            }
          });
          await crypto.checkKeyBackupAndEnable();
        }
      } catch (err) {
        console.warn("Failed to restore keys from backup:", err);
      }
    },

    async retryDecryption() {
      if (!this.client) return;
      const crypto = this.client.getCrypto();
      const rooms = this.client.getRooms(); // Check ALL rooms, not just visible ones

      console.log(`Retrying decryption for ${rooms.length} rooms...`);
      for (const room of rooms) {
        const events = room.getLiveTimeline().getEvents();
        for (const event of events) {
          if (event.isDecryptionFailure()) {
            // Use attemptDecryption which is standard for retrying
            await event.attemptDecryption(crypto as any, { isRetry: true });
          }
        }
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
      this.isClientReady = false;
      this._resetVerificationState();

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

    async refreshRoom(roomId: string) {
      if (!this.client) return;
      console.log(`[MatrixStore] Manual refresh requested for room: ${roomId}`);

      // If sync has stopped for some reason, restart it
      if (!this.isSyncing) {
        console.log('[MatrixStore] Sync was stopped, restarting...');
        await this.client.startClient();
      }
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