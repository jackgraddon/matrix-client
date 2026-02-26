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
import { getOidcConfig, registerClient, getLoginUrl, completeLoginFlow, getHomeserverUrl, getDeviceDisplayName } from '~/utils/matrix-auth';
// Tauri imports - explicit import is required as per user confirmation/config check
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { hostname, type, version } from '@tauri-apps/plugin-os';
import { MsgType, EventType } from 'matrix-js-sdk';
import { useRouter } from '#app';

export interface LastVisitedRooms {
  dm: string | null;
  rooms: string | null;
  spaces: Record<string, string>;
}

export interface UIState {
  memberListVisible: boolean;
  selectedUserId: string | null;
  profileCardPos: { top: string; right: string };
  collapsedCategories: string[];
  showEmptyRooms: boolean;
  // Composer states indexed by roomId
  composerStates: Record<string, {
    replyingTo?: any;
    editingMessage?: any;
    text?: string;
  }>;
  // Sortable sidebar state
  uiOrder: {
    rootSpaces: string[]; // Order of root spaces (pinned + others)
    categories: Record<string, string[]>; // Order of categories per spaceId
    rooms: Record<string, string[]>; // Order of rooms per categoryId
  };
}

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

// Outside your Pinia store, create a memory cache
const secretStorageKeys = new Map<string, Uint8Array<ArrayBuffer>>();

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
    activeVerificationRequest: null as VerificationRequest | null,
    verificationInitiatedByMe: false,
    activeSas: null as ShowSasCallbacks | null,
    isVerificationCompleted: false,
    verificationPhase: null as VerificationPhase | null,
    verificationModalOpen: false,
    globalSearchModalOpen: false,
    // Secret Storage / Backup Code Verification
    secretStoragePrompt: null as {
      promise: { resolve: (val: [string, Uint8Array<ArrayBuffer>] | null) => void, reject: (err?: any) => void },
      keyId: string,
      keyInfo: any // SecretStorageKeyDescription
    } | null,
    secretStorageKeyCache: {} as Record<string, Uint8Array>,
    secretStorageSetup: null as {
      defaultKeyId: string;
      needsPassphrase: boolean;
      passphraseInfo?: any;
    } | null,
    // Activity Status (Game Detection)
    activityStatus: null as string | null,
    activityDetails: null as { name: string; is_running: boolean } | null,
    isGameDetectionEnabled: false,

    customStatus: null as string | null,
    isLoggingIn: false,
    isRestoringKeys: false,

    lastVisitedRooms: (typeof localStorage !== 'undefined' ?
      JSON.parse(localStorage.getItem('matrix_last_visited_rooms') || '{"dm":null,"rooms":null,"spaces":{}}') :
      { dm: null, rooms: null, spaces: {} }) as LastVisitedRooms,
    hierarchyTrigger: 0,
    activeVoiceCall: null as {
      roomId: string;
      roomName: string;
      url: string;
      token: string;
    } | null,
    isIdle: false,
    pinnedSpaces: [] as string[],
    lastPresenceUpdate: 0,
    lastPresenceState: null as { presence: string; status_msg: string } | null,
    directMessageMap: {} as Record<string, string>,

    // Centralized UI State
    ui: {
      memberListVisible: (typeof localStorage !== 'undefined' ?
        localStorage.getItem('matrix_member_list_visible') === 'true' :
        false),
      selectedUserId: null,
      profileCardPos: { top: '0px', right: '0px' },
      collapsedCategories: (typeof localStorage !== 'undefined' ?
        JSON.parse(localStorage.getItem('matrix_collapsed_categories') || '[]') :
        []),
      showEmptyRooms: (typeof localStorage !== 'undefined' ?
        localStorage.getItem('matrix_show_empty_rooms') === 'true' :
        false),
      composerStates: {},
      uiOrder: (typeof localStorage !== 'undefined' ?
        JSON.parse(localStorage.getItem('matrix_ui_order') || '{"rootSpaces":[],"categories":{},"rooms":{}}') :
        { rootSpaces: [], categories: {}, rooms: {} }),
    } as UIState,
  }),

  getters: {
    isVerificationRequested: (state) => state.verificationPhase === VerificationPhase.Requested,
    isVerificationReady: (state) => state.verificationPhase === VerificationPhase.Ready,
    isVerificationStarted: (state) => state.verificationPhase === VerificationPhase.Started,
    getVoiceParticipants: (state) => (roomId: string) => {
      // Access hierarchyTrigger for reactivity
      state.hierarchyTrigger; // This line is for reactivity, not direct use

      if (!state.client) return [];

      const room = state.client.getRoom(roomId);
      if (!room) return [];

      const rtcSession = state.client.matrixRTC.getRoomSession(room);

      // Filter for non-expired memberships
      const participants = rtcSession.memberships
        .filter((member: any) => {
          // Safeguard: If this is US and we don't think we're in a call, hide us immediately
          if (member.userId === state.client?.getUserId() && state.activeVoiceCall?.roomId !== roomId) {
            return false;
          }

          const isExp = member.isExpired?.() ?? false;
          const isLeave = member.membership === 'leave';
          return !isExp && !isLeave;
        })
        .map((member: any) => {
          const user = room.getMember(member.sender);
          return {
            id: member.sender,
            name: user?.name || member.sender.split(':')[0].replace('@', ''), // Fallback to displayable username
            avatarUrl: user?.getMxcAvatarUrl() || null
          };
        });

      return participants;
    },

    hierarchy(state) {
      // Access hierarchyTrigger for reactivity
      state.hierarchyTrigger;

      if (!state.client) return { rootSpaces: [], directMessages: [], orphanRooms: [] };

      const allRooms = state.client.getVisibleRooms();
      const spaces: sdk.Room[] = [];
      const normalRooms: sdk.Room[] = [];

      // Separate by type
      allRooms.forEach(room => {
        if (room.isSpaceRoom()) {
          spaces.push(room);
        } else {
          normalRooms.push(room);
        }
      });

      // Map the Space Hierarchy
      const childRoomIds = new Set<string>();
      const spacesWithChildren = new Set<string>(); // To track active servers

      spaces.forEach(space => {
        const childEvents = space.currentState.getStateEvents('m.space.child');
        let hasValidChild = false;

        childEvents.forEach(event => {
          const content = event.getContent();
          if (content && Array.isArray(content.via) && content.via.length > 0) {
            childRoomIds.add(event.getStateKey() as string);
            hasValidChild = true;
          }
        });

        if (hasValidChild) {
          spacesWithChildren.add(space.roomId);
        }
      });

      // Also check m.space.parent in the rooms themselves for robustness
      allRooms.forEach(room => {
        const parentEvents = room.currentState.getStateEvents('m.space.parent');
        parentEvents.forEach(event => {
          const content = event.getContent();
          // If a canonical parent is set, mark it as a child
          if (content && content.via) {
            childRoomIds.add(room.roomId);
          }
        });
      });

      // Find the DMs (Read from the user's account data)
      const mDirectEvent = state.client.getAccountData(sdk.EventType.Direct);
      const mDirectContent = mDirectEvent ? mDirectEvent.getContent() : {};
      const dmRoomIds = new Set<string>();

      Object.values(mDirectContent).forEach((roomList: any) => {
        if (Array.isArray(roomList)) {
          roomList.forEach(roomId => dmRoomIds.add(roomId));
        }
      });

      // --- THE FINAL CATEGORIES ---

      // Servers: Spaces that have NO parents AND HAVE at least one child
      const rootSpaces = spaces.filter(space =>
        !childRoomIds.has(space.roomId) && spacesWithChildren.has(space.roomId)
      );

      // Pinned Spaces: Spaces that the user has pinned
      const pinnedRooms = state.pinnedSpaces
        .map(roomId => state.client?.getRoom(roomId))
        .filter((room): room is sdk.Room => !!room && room.isSpaceRoom());

      // Merge and deduplicate
      const allRootSpaces = [...rootSpaces];
      pinnedRooms.forEach(room => {
        if (!allRootSpaces.find(s => s.roomId === room.roomId)) {
          allRootSpaces.push(room);
        }
      });

      // DMs: Normal rooms that exist in the m.direct payload
      const directMessages = normalRooms.filter(room =>
        dmRoomIds.has(room.roomId)
      );

      // Orphan Rooms: Normal rooms that are NOT in a space, and are NOT DMs
      const orphanRooms = normalRooms.filter(room =>
        !childRoomIds.has(room.roomId) && !dmRoomIds.has(room.roomId)
      );

      return {
        rootSpaces: allRootSpaces,
        directMessages,
        orphanRooms,
      };
    },

    activeVoiceRoom(state) {
      if (!state.client || !state.activeVoiceCall) return null;
      return state.client.getRoom(state.activeVoiceCall.roomId);
    },
  },

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
            this.refreshPresence();
          } else {
            // Game stopped
            if (this.activityDetails?.name === name) {
              this.activityDetails = null;
              this.refreshPresence();
            }
          }
        });
      } catch (e) {
        console.error('[MatrixStore] Failed to bind listener:', e);
      }
    },

    setCustomStatus(status: string | null) {
      this.customStatus = status;
      this.refreshPresence();
    },

    async goOffline() {
      if (this.client && this.isAuthenticated) {
        console.log('[MatrixStore] Sending offline flare...');
        try {
          await this.client.setPresence({
            presence: 'offline',
            status_msg: this.customStatus || (this.activityDetails?.is_running ? `Playing ${this.activityDetails.name}` : '')
          });
        } catch (e) {
          console.error('[MatrixStore] Failed to send offline flare:', e);
        }
      }
    },

    setIdle(idle: boolean) {
      if (this.isIdle === idle) return;
      this.isIdle = idle;
      console.log('[MatrixStore] User idle status changed:', idle);
      this.refreshPresence();
    },

    async refreshPresence() {
      if (!this.client || !this.isAuthenticated || !this.isClientReady) return;

      const presence = this.isIdle ? 'unavailable' : 'online';
      const status_msg = this.customStatus || (this.activityDetails?.is_running ? `Playing ${this.activityDetails.name}` : '');

      // Check if state has actually changed
      const stateChanged = !this.lastPresenceState ||
        this.lastPresenceState.presence !== presence ||
        this.lastPresenceState.status_msg !== status_msg;

      const now = Date.now();
      const throttleMs = 30 * 1000; // 30 seconds

      // Only skip if no change AND within throttle window
      if (!stateChanged && (now - this.lastPresenceUpdate < throttleMs)) {
        return;
      }

      console.log(`[MatrixStore] Refreshing presence: ${presence} ("${status_msg}")`);

      try {
        await this.client.setPresence({ presence: presence as any, status_msg });
        this.lastPresenceUpdate = now;
        this.lastPresenceState = { presence, status_msg };
      } catch (err: any) {
        if (err?.errcode === 'M_LIMIT_EXCEEDED') {
          console.warn('[MatrixStore] Presence update rate limited by server');
        } else {
          console.error('[MatrixStore] Failed to update presence:', err);
        }
      }
    },

    async setProfileDisplayName(displayName: string) {
      if (!this.client) return;
      try {
        await this.client.setDisplayName(displayName);
        if (this.user) this.user.displayName = displayName;
        toast.success('Display name updated');
      } catch (e) {
        console.error('[MatrixStore] Failed to set display name:', e);
        toast.error('Failed to update display name');
      }
    },

    async uploadAndSetProfileAvatar(file: File) {
      if (!this.client) return;
      try {
        const response = await this.client.uploadContent(file, { type: file.type });
        const mxcUrl = response.content_uri;
        await this.client.setAvatarUrl(mxcUrl);
        if (this.user) this.user.avatarUrl = mxcUrl;
        toast.success('Avatar updated');
      } catch (e) {
        console.error('[MatrixStore] Failed to upload/set avatar:', e);
        toast.error('Failed to update avatar');
      }
    },

    toggleMemberList() {
      this.ui.memberListVisible = !this.ui.memberListVisible;
      localStorage.setItem('matrix_member_list_visible', String(this.ui.memberListVisible));
    },

    setUISelectedUser(userId: string | null, pos?: { top: string; right: string }) {
      this.ui.selectedUserId = userId;
      if (pos) {
        this.ui.profileCardPos = pos;
      }
    },

    setUIComposerState(roomId: string, state: Partial<UIState['composerStates'][string]>) {
      if (!this.ui.composerStates[roomId]) {
        this.ui.composerStates[roomId] = {};
      }
      this.ui.composerStates[roomId] = {
        ...this.ui.composerStates[roomId],
        ...state
      };
    },

    toggleUICategory(categoryId: string) {
      const index = this.ui.collapsedCategories.indexOf(categoryId);
      if (index === -1) {
        this.ui.collapsedCategories.push(categoryId);
      } else {
        this.ui.collapsedCategories.splice(index, 1);
      }
      localStorage.setItem('matrix_collapsed_categories', JSON.stringify(this.ui.collapsedCategories));
    },

    toggleShowEmptyRooms() {
      this.ui.showEmptyRooms = !this.ui.showEmptyRooms;
      localStorage.setItem('matrix_show_empty_rooms', String(this.ui.showEmptyRooms));
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

      // Ensure homeserverUrl has https:// for internal use
      const fullUrl = homeserverUrl.startsWith('http') ? homeserverUrl : `https://${homeserverUrl}`;
      localStorage.setItem('matrix_homeserver_url', fullUrl);

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
        // --- Custom Loopback OAuth Flow (Desktop) ---
        // Start the custom Rust server
        const oauthPromise = invoke<string>('start_oauth_server');

        const redirectUri = "http://localhost:1420";
        localStorage.setItem('matrix_oidc_redirect_uri', redirectUri);

        const authConfig = await getOidcConfig(fullUrl);
        const clientId = await registerClient(authConfig, redirectUri);
        const nonce = generateNonce();

        localStorage.setItem('matrix_oidc_config', JSON.stringify(authConfig));
        localStorage.setItem('matrix_oidc_client_id', clientId);
        localStorage.setItem('matrix_oidc_nonce', nonce);

        const loginUrl = await getLoginUrl(authConfig, clientId, nonce, redirectUri, fullUrl);

        // Open the system browser (not the webview)
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(loginUrl);

        // Wait for the Rust server to capture the code
        try {
          const callbackUrl = await oauthPromise;
          const parsed = new URL(callbackUrl);
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
            console.error('[OAuth Loopback] Missing code or state in callback URL:', callbackUrl);
            this.cancelLogin('missing_credentials');
          }
        } catch (err: any) {
          console.error('[OAuth Loopback] Custom server failed or timed out:', err);
          this.cancelLogin(err?.message || 'callback_failed');
        }
      } else {
        // --- Standard Web/PWA Flow ---
        const authConfig = await getOidcConfig(fullUrl);
        const clientId = await registerClient(authConfig);
        const nonce = generateNonce();

        localStorage.setItem('matrix_oidc_config', JSON.stringify(authConfig));
        localStorage.setItem('matrix_oidc_client_id', clientId);
        localStorage.setItem('matrix_oidc_nonce', nonce);
        localStorage.setItem('matrix_oidc_redirect_uri', window.location.origin + '/auth/callback');

        const url = await getLoginUrl(authConfig, clientId, nonce, undefined, fullUrl);
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
          getSecretStorageKey: async ({ keys }: { keys: Record<string, any> }): Promise<[string, Uint8Array<ArrayBuffer>] | null> => {
            const keyIds = Object.keys(keys);
            const keyId = keyIds.find(id => secretStorageKeys.get(id) instanceof Uint8Array);
            if (!keyId) {
              // This tells the SDK to pause and wait!
              return new Promise<[string, Uint8Array<ArrayBuffer>] | null>((resolve, reject) => {
                const firstKeyId = Object.keys(keys)[0];
                if (!firstKeyId) {
                  resolve(null);
                  return;
                }
                const keyInfo = keys[firstKeyId];

                this.secretStoragePrompt = {
                  promise: { resolve, reject: (err: any) => reject(err) },
                  keyId: firstKeyId,
                  keyInfo
                } as any;
              }) as Promise<[string, Uint8Array<ArrayBuffer>] | null>;
            }
            return [keyId, secretStorageKeys.get(keyId)!] as [string, Uint8Array<ArrayBuffer>];
          },
          cacheSecretStorageKey: (keyId: string, _keyInfo: any, privateKey: Uint8Array) => {
            secretStorageKeys.set(keyId, privateKey as Uint8Array<ArrayBuffer>);
          },
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
              getSecretStorageKey: async ({ keys }: { keys: Record<string, any> }): Promise<[string, Uint8Array<ArrayBuffer>] | null> => {
                const keyIds = Object.keys(keys);
                const keyId = keyIds.find(id => secretStorageKeys.get(id) instanceof Uint8Array);
                if (!keyId) {
                  return new Promise<[string, Uint8Array<ArrayBuffer>] | null>((resolve, reject) => {
                    const firstKeyId = Object.keys(keys)[0];
                    if (!firstKeyId) {
                      resolve(null);
                      return;
                    }
                    const keyInfo = keys[firstKeyId];
                    this.secretStoragePrompt = {
                      promise: { resolve, reject: (err: any) => reject(err) },
                      keyId: firstKeyId,
                      keyInfo
                    } as any;
                  }) as Promise<[string, Uint8Array<ArrayBuffer>] | null>;
                }
                return [keyId, secretStorageKeys.get(keyId)!] as [string, Uint8Array<ArrayBuffer>];
              },
              cacheSecretStorageKey: (keyId: string, _keyInfo: any, privateKey: Uint8Array) => {
                secretStorageKeys.set(keyId, privateKey as Uint8Array<ArrayBuffer>);
              },
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
          // Refresh presence now that we are ready
          this.refreshPresence();
        }
      });

      // Listen for MatrixRTC memberships to update sidebar icons/lists
      this.client.on(sdk.RoomStateEvent.Events, (event) => {
        const type = event.getType();
        if (type === 'org.matrix.msc3401.call.member' || type === 'm.call.member' || type === 'm.rtc.member') {
          console.log(`[Voice] State event received: ${type}, trigger refresh`);
          this.hierarchyTrigger++;
        }
      });

      this.client.on(sdk.ClientEvent.Event, (event) => {
        const type = event.getType();
        if (type === 'org.matrix.msc3401.call.member' || type === 'm.call.member' || type === 'm.rtc.member') {
          console.log(`[Voice] Event received: ${type}, trigger refresh`);
          this.hierarchyTrigger++;
        }
      });

      // Sync device name to Matrix homeserver (re-overwrites "Unknown Device")
      this.updateDeviceName();

      if (cryptoReady) {
        // Check if this device is already verified (initial check)
        this.checkDeviceVerified();
      }

      // Fetch profile after login
      this.fetchUserProfile(userId);
      this.checkSecretStorageSetup();
      this.setupVerificationListeners();
      this.setupHierarchyListeners();
    },

    setupHierarchyListeners() {
      if (!this.client) return;

      this.client.on(sdk.ClientEvent.Room, () => this.updateHierarchy());
      this.client.on(sdk.ClientEvent.AccountData, (event) => {
        if (event.getType() === sdk.EventType.Direct) {
          this.updateHierarchy();
          this.updateDirectMessageMap();
        }
        if (event.getType() === 'cc.jackg.ruby.pinned_spaces') this.updatePinnedSpaces();
        if (event.getType() === 'cc.jackg.ruby.ui_order') this.loadUIOrderFromAccountData();
      });
      // Listen for parent/child changes
      this.client.on(sdk.RoomStateEvent.Events, (event) => {
        const type = event.getType();
        if (type === 'm.space.child' || type === 'm.space.parent') {
          this.updateHierarchy();
        }
      });

      // Initial trigger
      this.updatePinnedSpaces();
      this.loadUIOrderFromAccountData();
      this.updateDirectMessageMap();
      this.updateHierarchy();
    },

    updateDirectMessageMap() {
      if (!this.client) return;
      const dmEvent = this.client.getAccountData(sdk.EventType.Direct);
      if (!dmEvent) return;
      const content = dmEvent.getContent();
      const newMap: Record<string, string> = {};
      for (const [userId, roomIds] of Object.entries(content)) {
        if (Array.isArray(roomIds) && roomIds.length > 0) {
          newMap[userId] = roomIds[0];
        }
      }
      this.directMessageMap = newMap;
    },

    loadUIOrderFromAccountData() {
      if (!this.client) return;
      const event = (this.client as any).getAccountData('cc.jackg.ruby.ui_order');
      if (event) {
        const content = event.getContent();
        if (content) {
          this.ui.uiOrder = {
            rootSpaces: Array.isArray(content.rootSpaces) ? content.rootSpaces : [],
            categories: content.categories || {},
            rooms: content.rooms || {}
          };
          localStorage.setItem('matrix_ui_order', JSON.stringify(this.ui.uiOrder));
        }
      }
    },

    async saveUIOrder() {
      // Optimistic update to local storage
      localStorage.setItem('matrix_ui_order', JSON.stringify(this.ui.uiOrder));

      if (!this.client) return;
      try {
        await (this.client as any).setAccountData('cc.jackg.ruby.ui_order', this.ui.uiOrder);
      } catch (e) {
        console.error('Failed to save UI order to account data:', e);
      }
    },

    updateRootSpacesOrder(newOrder: string[]) {
      this.ui.uiOrder.rootSpaces = newOrder;
      this.saveUIOrder();
    },

    updateCategoryOrder(spaceId: string, newOrder: string[]) {
      this.ui.uiOrder.categories[spaceId] = newOrder;
      this.saveUIOrder();
    },

    updateRoomOrder(categoryId: string, newOrder: string[]) {
      this.ui.uiOrder.rooms[categoryId] = newOrder;
      this.saveUIOrder();
    },

    updatePinnedSpaces() {
      if (!this.client) return;
      const event = (this.client as any).getAccountData('cc.jackg.ruby.pinned_spaces');
      if (event) {
        const content = event.getContent();
        if (content && Array.isArray(content.rooms)) {
          this.pinnedSpaces = content.rooms;
        }
      }
    },

    updateHierarchy() {
      this.hierarchyTrigger++;
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

    async updateDeviceName() {
      if (!this.client) return;

      try {
        // 1. Check if the SDK knows the device ID
        let deviceId = this.client.getDeviceId();

        // 2. If missing (standard for OIDC), ask the server who we are!
        if (!deviceId) {
          const whoami = await this.client.whoami();
          deviceId = whoami.device_id ?? null;

          if (!deviceId) {
            console.warn('Cannot update device name: Still no device ID returned from the server.');
            return;
          }

          // CRITICAL: Save this device ID to your local storage!
          // You must pass this into sdk.createClient({ deviceId }) on future 
          // app boots so End-to-End Encryption (Emojis) works properly!
          localStorage.setItem('matrix_device_id', deviceId);
        }

        // 3. Grab the hardware details
        let host = 'Web';
        let osType = 'Unknown OS';
        let osVersion = '';

        if (!!(window as any).__TAURI_INTERNALS__) {
          try {
            host = await hostname() || 'Unknown Host';
            osType = type();
            osVersion = version();
          } catch (tauriErr) {
            console.warn('Failed to get OS info via Tauri:', tauriErr);
          }
        } else {
          // Fallback for web
          host = 'Browser';
          osType = navigator.platform;
        }

        const deviceName = `Ruby Chat on ${host} (${osType}${osVersion ? ' ' + osVersion : ''})`;

        console.log(`Attempting to rename Matrix Device ${deviceId} to: ${deviceName}`);

        // 4. Update the actual Matrix Device Name in Synapse
        await this.client.setDeviceDetails(deviceId, {
          display_name: deviceName
        });

        console.log('✅ Successfully synced device name to ' + deviceName);
      } catch (err) {
        console.error('❌ Failed to update Matrix device name', err);
      }
    },

    async checkSecretStorageSetup() {
      if (!this.client) return;
      try {
        const defaultKey = await this.client.getAccountData('m.secret_storage.default_key');
        if (defaultKey) {
          const keyId = defaultKey.getContent().key;
          const keyInfo = await this.client.getAccountData(`m.secret_storage.key.${keyId}`);
          if (keyInfo) {
            const content = keyInfo.getContent();
            this.secretStorageSetup = {
              defaultKeyId: keyId,
              needsPassphrase: !!content.passphrase,
              passphraseInfo: content.passphrase
            };
            console.log('[SecretStorage] Setup detected:', this.secretStorageSetup);
          }
        }
      } catch (e) {
        console.error('[SecretStorage] Failed to check setup:', e);
      }
    },

    async joinVoiceChannel(roomOrId: sdk.Room | string) {
      if (!this.client) return;
      console.log(`[Voice] joinVoiceChannel entry: ${typeof roomOrId === 'string' ? roomOrId : roomOrId.roomId}`);

      const room = typeof roomOrId === 'string' ? this.client.getRoom(roomOrId) : roomOrId;
      if (!room) {
        toast.error('Room not found');
        return;
      }

      // 0. Leave existing call if any
      if (this.activeVoiceCall) {
        this.leaveVoiceChannel(this.activeVoiceCall.roomId);
      }

      try {
        // 1. Tell Matrix we are jumping into the call with E2EE enabled
        const rtcSession = this.client.matrixRTC.getRoomSession(room);
        const userId = this.client.getUserId()!;
        const deviceId = this.client.getDeviceId()!;
        rtcSession.joinRTCSession(
          { userId, deviceId, memberId: `${userId}:${deviceId}` },
          [],           // fociPreferred
          undefined,    // multiSfuFocus
          { manageMediaKeys: true, useExperimentalToDeviceTransport: true },
        );
        console.log(`[Voice] Joined MatrixRTC session for ${room.roomId} via joinRTCSession (manageMediaKeys: true, toDeviceTransport: true)`);

        // Listen for to-device encryption key events as a manual backup.
        // The SDK's internal ToDeviceKeyTransport should handle this via
        // useExperimentalToDeviceTransport, but we also listen manually
        // to ensure the signaling handshake completes with Element.
        this.client.on('toDeviceEvent' as any, (event: any) => {
          const evType = event.getType?.() ?? '';
          if (evType === 'io.element.call.encryption_keys') {
            console.log(`[Voice] Received encryption keys signaling from ${event.getSender?.()} (type=${evType})`);
          } else {
            console.log(`[Voice][DIAG] toDeviceEvent: type=${evType} sender=${event.getSender?.()}`);
          }
        });

        // Track encryption key changes — confirms the SDK's E2EE pipeline is end-to-end
        (rtcSession as any).on('encryption_key_changed', (keyBin: any, keyIndex: number, membership: any, rtcBackendIdentity: string) => {
          console.log(`[Voice][DIAG] EncryptionKeyChanged: identity=${rtcBackendIdentity} index=${keyIndex} userId=${membership?.userId} deviceId=${membership?.deviceId}`);
        });

        // 2. Prove our identity to Matrix.org by requesting a secure OpenID token
        const openIdToken = await this.client.getOpenIdToken();
        console.log(`[Voice] Obtained OpenID token`);

        // 3. Ask the Matrix.org Authorization Service for a LiveKit ticket
        const response = await fetch('https://livekit-jwt.call.matrix.org/sfu/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: room.roomId,
            device_id: this.client.getDeviceId(),
            openid_token: openIdToken
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to get LiveKit JWT: ${response.statusText}`);
        }

        const livekitData = await response.json();
        console.log(`[Voice] Obtained LiveKit JWT and URL:`, livekitData.url);

        // 4. Save this data to your store
        this.activeVoiceCall = {
          roomId: room.roomId,
          roomName: room.name,
          url: livekitData.url,
          token: livekitData.jwt,
        };
        console.log(`[Voice] activeVoiceCall updated in store:`, this.activeVoiceCall);

        toast.success('Joined Voice Channel', {
          description: `You are now in ${room.name}`,
        });
      } catch (e: any) {
        console.error('Failed to join voice channel:', e);
        this.activeVoiceCall = null;
        toast.error('Voice Error', {
          description: e.message || 'Failed to connect to the voice server.',
        });
      }
    },

    leaveVoiceChannel(roomOrId: sdk.Room | string) {
      if (!this.client) return;

      const room = typeof roomOrId === 'string' ? this.client.getRoom(roomOrId) : roomOrId;
      console.log(`[Voice] leaveVoiceChannel called for: ${room?.name || roomOrId}`);
      if (!room) {
        this.activeVoiceCall = null;
        return;
      }

      try {
        const rtcSession = this.client.matrixRTC.getRoomSession(room);
        rtcSession.leaveRoomSession();
        console.log(`[Voice] Called leaveRoomSession for ${room.roomId}`);
      } catch (e) {
        console.error('[Voice] Error leaving RTC session:', e);
      }

      this.activeVoiceCall = null;
      toast.info('Left Voice Channel');
    },

    // --- Verification Actions ---



    async submitSecretStorageKey(input: string) {
      if (!this.secretStoragePrompt || !this.client) return;

      const { promise, keyId, keyInfo } = this.secretStoragePrompt;

      try {
        let keyArray: Uint8Array;

        // Try to decode as Recovery Key (Base58)
        const cleanInput = input.trim();
        let isRecoveryKey = false;
        try {
          keyArray = decodeRecoveryKey(cleanInput);
          isRecoveryKey = true;
        } catch (e) {
          // Not a valid recovery key, assume passphrase
        }

        if (!isRecoveryKey) {
          if (keyInfo.passphrase) {
            keyArray = await deriveRecoveryKeyFromPassphrase(
              input,
              keyInfo.passphrase.salt,
              keyInfo.passphrase.iterations
            );
          } else {
            throw new Error("Input is not a valid recovery key and no passphrase info available.");
          }
        }

        // Validate the key mathematically
        const match = await this.client.secretStorage.checkKey(keyArray!, keyInfo);
        if (!match) {
          throw new Error("Invalid key: The provided recovery key or passphrase does not match.");
        }

        // Cache in memory Map for background SDK
        secretStorageKeys.set(keyId, keyArray! as Uint8Array<ArrayBuffer>);
        // Also cache in the Pinia record for any other listeners
        this.secretStorageKeyCache[keyId] = keyArray! as Uint8Array<ArrayBuffer>;

        // Resolve the callback's promise
        promise.resolve([keyId, keyArray! as Uint8Array<ArrayBuffer>]);
        this.secretStoragePrompt = null;

      } catch (e: any) {
        console.error("Failed to process secret storage key:", e);
        toast.error('Encryption Key Error', {
          description: e.message || "Failed to validate encryption key.",
        });
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
        if (this.activeVerificationRequest) {
          try {
            await this.activeVerificationRequest.cancel();
          } catch (e) {
            console.warn("Failed to cancel previous verification request:", e);
          }
          this.activeVerificationRequest = null;
        }

        // Set state immediately to show "Waiting..." UI instead of "Incoming Request"
        this.verificationInitiatedByMe = true;
        this.isVerificationCompleted = false;
        this.activeSas = null;

        const request = await crypto.requestOwnUserVerification();
        this.activeVerificationRequest = request;
        this.verificationPhase = request.phase;
        this._attachRequestListeners(request);
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
      if (!this.activeVerificationRequest && !this.isVerificationCompleted) {
        // Only reset if we aren't in the middle of something or just finished
        this._resetVerificationState();
      }
    },

    setupVerificationListeners() {
      if (!this.client) return;

      this.client.on(CryptoEvent.VerificationRequestReceived, (request: VerificationRequest) => {
        // 1. Ignore if we started this request ourselves
        if (request.initiatedByMe) return;

        console.log('Incoming verification from:', request.otherUserId);

        // 2. Save it to state so your UI can pop open a modal
        this.activeVerificationRequest = request;
        this.verificationPhase = request.phase;
        this.verificationInitiatedByMe = false;
        this.verificationModalOpen = true;

        // 3. Attach standard request listeners (handles Done/Cancelled)
        this._attachRequestListeners(request);
      });

      // Listen for security status changes to update UI in real-time
      this.client.on(CryptoEvent.KeysChanged, () => this.checkDeviceVerified());
      this.client.on(CryptoEvent.UserTrustStatusChanged, () => this.checkDeviceVerified());
    },

    _attachRequestListeners(request: VerificationRequest) {
      const checkPhase = async () => {
        try {
          const phase = request.phase;
          this.verificationPhase = phase;
          const isTerminal = phase === VerificationPhase.Done || phase === VerificationPhase.Cancelled;

          console.log(`[Verification] Phase: ${phase} (${request.otherUserId})`);

          let methods: string[] = [];
          try {
            methods = (request as any).methods || [];
          } catch (e) {
            if (!isTerminal) console.warn('[Verification] methods not available');
          }

          if (phase === VerificationPhase.Ready) {
            // Initiator auto-starts SAS
            if (this.verificationInitiatedByMe && (methods.includes('m.sas.v1') || methods.length === 0)) {
              console.log('[Verification] Auto-starting SAS...');
              try {
                const verifier = await request.startVerification('m.sas.v1');
                this._setupVerifierListeners(verifier);
              } catch (e) {
                console.error('[Verification] Proactive start failed:', e);
              }
            }
          } else if (phase === VerificationPhase.Started) {
            const verifier = request.verifier;
            if (verifier && !this._isVerifierSetup(verifier)) {
              this._setupVerifierListeners(verifier);
            }
          } else if (phase === VerificationPhase.Done) {
            this.isVerificationCompleted = true;
            this.activeSas = null;
            await this.checkDeviceVerified();
            await this.requestSecretsFromOtherDevices();
            await this.restoreKeysFromBackup();
            await this.retryDecryption();
            toast.success('Device verified!');
            setTimeout(() => this._resetVerificationState(), 3000);
          } else if (phase === VerificationPhase.Cancelled) {
            this._resetVerificationState();
          }

          if (isTerminal) {
            request.off(VerificationRequestEvent.Change, checkPhase);
          }
        } catch (err) {
          console.error('[Verification] Error in checkPhase:', err);
        }
      };

      request.on(VerificationRequestEvent.Change, checkPhase);
      checkPhase();
    },

    _setupVerifierListeners(verifier: Verifier) {
      if (this._isVerifierSetup(verifier)) return;

      console.log('[Verification] Setting up listeners for verifier:', verifier.userId);

      const onShowSas = (sas: ShowSasCallbacks) => {
        console.log('[Verification] SAS data received, showing emojis.');
        this.activeSas = sas;
      };

      const onCancel = () => {
        console.warn('[Verification] Verifier cancelled by remote.');
        cleanup();
        this._resetVerificationState();
      };

      const cleanup = () => {
        console.log('[Verification] Cleaning up verifier listeners.');
        verifier.off(VerifierEvent.ShowSas, onShowSas);
        verifier.off(VerifierEvent.Cancel, onCancel);
      };

      verifier.on(VerifierEvent.ShowSas, onShowSas);
      verifier.on(VerifierEvent.Cancel, onCancel);

      // Kick off the verification exchange
      console.log('[Verification] Kicking off verifier.verify()...');
      verifier.verify().then(() => {
        cleanup();
      }).catch((e) => {
        console.error('[Verification] verifier.verify() failed:', e);
        cleanup();
        // Only reset if it's a real error, not just a cancellation we handled
        if (!verifier.hasBeenCancelled) {
          this._resetVerificationState();
        }
      });
    },

    _isVerifierSetup(verifier: Verifier): boolean {
      // Use the internal event emitter count as a robust check
      return verifier.listenerCount(VerifierEvent.ShowSas) > 0;
    },

    async acceptVerification() {
      if (!this.activeVerificationRequest) return;
      const request = this.activeVerificationRequest;

      try {
        // Always attach request listeners to track state
        this._attachRequestListeners(request);

        if (request.phase === VerificationPhase.Ready) {
          // If already Ready, "Accept" means "Start the exchange"
          console.log('[Verification] Manual Accept: Request is already Ready, starting SAS...');
          const verifier = await request.startVerification('m.sas.v1');
          this._setupVerifierListeners(verifier);
        } else if (request.phase < VerificationPhase.Ready) {
          // Otherwise, we need to send the 'ready' event
          console.log('[Verification] Manual Accept: Sending .ready event...');
          await request.accept();
        } else {
          console.warn('[Verification] Manual Accept: Request is already in phase', request.phase);
        }
      } catch (e) {
        console.error('Failed to accept verification:', e);
        toast.error('Failed to handle verification request');
        this._resetVerificationState();
      }
    },

    async confirmSasMatch(match: boolean = true) {
      if (!this.activeSas) return;
      try {
        if (match) {
          await this.activeSas.confirm();
        } else {
          await this.activeSas.mismatch();
          this.activeVerificationRequest?.cancel();
        }
        // Hide emojis while waiting for Done phase
        this.activeSas = null;
      } catch (e) {
        console.error('Failed to confirm SAS:', e);
        toast.error('Verification failed');
        this._resetVerificationState();
      }
    },

    async cancelVerification() {
      if (this.activeVerificationRequest) {
        try {
          await this.activeVerificationRequest.cancel();
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
          console.log('[Verification] Cross-signing is now ready. Triggering secret gossip and re-decryption...');

          // Request secrets just in case they haven't arrived yet
          this.requestSecretsFromOtherDevices();

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
      this.activeVerificationRequest = null;
      this.verificationInitiatedByMe = false;
      this.activeSas = null;
      this.isVerificationCompleted = false;
      this.verificationPhase = null;
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
      if (!this.client || this.isRestoringKeys) return;
      const crypto = this.client.getCrypto();
      if (!crypto) return;

      this.isRestoringKeys = true;
      console.log("[SecretGossiping] Checking for historical key backups...");
      try {
        const backupInfo = await crypto.getKeyBackupInfo();
        if (!backupInfo) {
          console.log("[SecretGossiping] No key backup found on server.");
          this.isRestoringKeys = false;
          return;
        }

        // 1. Wait for secrets to arrive via gossip (Secret Sharing)
        // We poll for up to 10 seconds (20 * 500ms) to be patient with cross-network gossip
        console.log("[SecretGossiping] Polling for backup key via gossip...");
        // @ts-ignore - access internal crypto method if needed
        let backupKey = await (crypto as any).getSessionBackupPrivateKey();
        let attempts = 0;
        const maxAttempts = 20;

        while (!backupKey && attempts < maxAttempts) {
          // Logic: Wait, then check
          await new Promise(r => setTimeout(r, 500));
          backupKey = await (crypto as any).getSessionBackupPrivateKey();
          attempts++;

          if (backupKey) {
            console.log(`[SecretGossiping] Backup key received via gossip after ${attempts * 0.5}s!`);
            break;
          }

          if (attempts % 4 === 0) {
            console.log(`[SecretGossiping] Still waiting for gossip... (${attempts * 0.5}s)`);
          }
        }

        // 2. Fallback to SSSS if gossip failed
        if (!backupKey) {
          console.warn("[SecretGossiping] Gossip timed out after 10s. Falling back to manual Secret Storage prompt.");
          await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
        }

        // 3. Restore the backup
        console.log("[SecretGossiping] Restoring keys from backup...");
        await crypto.restoreKeyBackup({
          progressCallback: (p) => {
            if (p.stage === 'load_keys' && p.total > 0) {
              if (p.successes % 100 === 0 || p.successes === p.total) {
                console.log(`[SecretGossiping] Restoring keys: ${p.successes}/${p.total}`);
              }
            }
          }
        });
        await crypto.checkKeyBackupAndEnable();
        console.log("[SecretGossiping] History restoration complete.");
      } catch (err) {
        console.warn("[SecretGossiping] Failed to restore keys from backup:", err);
      } finally {
        this.isRestoringKeys = false;
      }
    },

    async requestSecretsFromOtherDevices() {
      const crypto = this.client?.getCrypto();
      if (!crypto) return;

      console.log('[SecretGossiping] Requesting secrets from other trusted devices...');
      try {
        // Request cross-signing keys and the megolm backup key for history
        await Promise.all([
          (crypto as any).requestSecret('m.cross_signing.master'),
          (crypto as any).requestSecret('m.cross_signing.self_signing'),
          (crypto as any).requestSecret('m.cross_signing.user_signing'),
          (crypto as any).requestSecret('m.megolm_backup.v1')
        ]);
        console.log('[SecretGossiping] Successfully requested secrets.');
      } catch (err) {
        console.warn('[SecretGossiping] Failed to gossip secrets, user may need manual key entry:', err);
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

    // --- Room Creation ---
    openGlobalSearchModal() {
      this.globalSearchModalOpen = true;
    },

    closeGlobalSearchModal() {
      this.globalSearchModalOpen = false;
    },

    async joinRoom(roomIdOrAlias: string): Promise<any> {
      if (!this.client) throw new Error("Matrix client not initialized.");
      console.log(`[MatrixStore] Joining room ${roomIdOrAlias}...`);

      try {
        const result = await this.client.joinRoom(roomIdOrAlias);
        console.log(`[MatrixStore] Joined room ${result.roomId}`);
        return result;
      } catch (err: any) {
        console.error("[MatrixStore] Failed to join room:", err);
        throw new Error(err.message || "Failed to join room.");
      }
    },

    async createDirectRoom(userId: string): Promise<string | undefined> {
      if (!this.client) throw new Error("Matrix client not initialized.");
      console.log(`[MatrixStore] Creating direct room with ${userId}...`);

      try {
        const result = await this.client.createRoom({
          is_direct: true,
          invite: [userId],
          preset: sdk.Preset.TrustedPrivateChat,
        });

        console.log(`[MatrixStore] Created room ${result.room_id}`);
        return result.room_id;
      } catch (err: any) {
        console.error("[MatrixStore] Failed to create direct room:", err);
        throw new Error(err.message || "Failed to create room.");
      }
    },

    setLastVisitedRoom(context: 'dm' | 'rooms' | string, roomId: string | null) {
      if (context === 'dm') {
        this.lastVisitedRooms.dm = roomId;
      } else if (context === 'rooms') {
        this.lastVisitedRooms.rooms = roomId;
      } else {
        // Assume context is a Space ID
        if (roomId) {
          this.lastVisitedRooms.spaces[context] = roomId;
        } else {
          delete this.lastVisitedRooms.spaces[context];
        }
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('matrix_last_visited_rooms', JSON.stringify(this.lastVisitedRooms));
      }
    },

    async pinSpace(roomId: string) {
      if (!this.client) return;
      console.log(`[MatrixStore] Pinning space: ${roomId}`);
      if (!this.pinnedSpaces.includes(roomId)) {
        const newPinned = [...this.pinnedSpaces, roomId];
        this.pinnedSpaces = newPinned;
        await (this.client as any).setAccountData('cc.jackg.ruby.pinned_spaces', { rooms: newPinned });
      }
    },

    async unpinSpace(roomId: string) {
      if (!this.client) return;
      console.log(`[MatrixStore] Unpinning space: ${roomId}`);
      const newPinned = this.pinnedSpaces.filter(id => id !== roomId);
      this.pinnedSpaces = newPinned;
      await (this.client as any).setAccountData('cc.jackg.ruby.pinned_spaces', { rooms: newPinned });
    }
  }
});