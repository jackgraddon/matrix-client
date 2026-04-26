import { defineStore } from 'pinia';
import * as sdk from 'matrix-js-sdk';
import { VerificationPhase } from 'matrix-js-sdk/lib/crypto-api/verification';
import { getOidcConfig, registerClient, getLoginUrl } from '~/utils/matrix-auth';
import type { VerificationRequest, ShowSasCallbacks } from 'matrix-js-sdk/lib/crypto-api/verification';

export interface LastVisitedRooms {
  dm: string | null;
  rooms: string | null;
  spaces: Record<string, string>;
}

export const useMatrixStore = defineStore('matrix', {
  state: () => ({
    client: null as sdk.MatrixClient | null,
    isAuthenticated: false,
    isSyncing: false,
    isClientReady: false,
    isReady: false,
    isRestoringSession: true,
    isCryptoDegraded: false,
    cryptoStatusMessage: null as string | null,
    lastSyncError: null as any | null,
    user: null as {
      userId: string;
      displayName?: string;
      avatarUrl?: string;
      description?: string;
      status_msg?: string;
    } | null,

    // Verification state
    isCrossSigningReady: false,
    isSecretStorageReady: false,
    activeVerificationRequest: null as VerificationRequest | null,
    isVerificationInitiatedByMe: false,
    isRequestingVerification: false,
    activeSas: null as ShowSasCallbacks | null,
    isVerificationCompleted: false,
    isRestoringHistory: false,
    verificationPhase: null as VerificationPhase | null,
    qrCodeData: null as any | null,
    secretStoragePrompt: null as {
        promise: { resolve: (val: any) => void, reject: (err: any) => void },
        keyId: string,
        keyInfo: any
    } | null,

    // Settings & State
    pushNotificationsEnabled: true,
    showContentInNotifications: true,
    customPushEndpoint: null as string | null,
    notificationsQuietUntil: 0,
    lastVisitedRooms: { dm: null, rooms: null, spaces: {} } as LastVisitedRooms,
    lastPresenceState: null as { presence: string; status_msg: string } | null,

    // Dehydration & Hierarchy
    hierarchyTrigger: 0,
    spaceHierarchies: {} as Record<string, any[]>,
    isIdle: false,
    pinnedSpaces: [] as string[],
    unreadTrigger: 0,
    unreadCountType: sdk.NotificationCountType.Total as sdk.NotificationCountType,
    manualUnread: {} as Record<string, boolean>,
    directMessageMap: {} as Record<string, string>,

    customStatus: null as string | null,
    loginStatus: '' as string,
    isFullySynced: false,
    isLoggingOut: false,
    isLoggingIn: false,
    startMinimized: false,
    inviteRoomId: null as string | null,
    isSasConfirming: false,
    isSasTimeout: false,
  }),

  getters: {
    invites: (state) => {
      if (!state.client) return [];
      return state.client.getVisibleRooms().filter(r => r.getMyMembership() === 'invite');
    },
    hierarchy(state) {
      state.hierarchyTrigger;
      if (!state.client) return { rootSpaces: [], directMessages: [], orphanRooms: [] };

      const all = state.client.getVisibleRooms().filter(r => ['join', 'invite'].includes(r.getMyMembership()));
      const childIds = new Set<string>();
      const spacesWithChildren = new Set<string>();

      all.forEach(r => {
        if (r.isSpaceRoom()) {
          r.currentState.getStateEvents('m.space.child').forEach(ev => {
            if (ev.getContent()?.via?.length) {
              childIds.add(ev.getStateKey()!);
              spacesWithChildren.add(r.roomId);
            }
          });
        }
      });

      const dmRoomIds = new Set<string>();
      const dmEvent = state.client.getAccountData(sdk.EventType.Direct);
      if (dmEvent) Object.values(dmEvent.getContent()).forEach((list: any) => list.forEach((id: string) => dmRoomIds.add(id)));

      return {
        rootSpaces: all.filter(r => r.isSpaceRoom() && (state.pinnedSpaces.includes(r.roomId) || (!childIds.has(r.roomId) && spacesWithChildren.has(r.roomId)))),
        directMessages: all.filter(r => dmRoomIds.has(r.roomId)),
        orphanRooms: all.filter(r => !r.isSpaceRoom() && !childIds.has(r.roomId) && !dmRoomIds.has(r.roomId)),
      };
    },
    totalInviteCount(state): number {
        state.unreadTrigger;
        return state.client?.getVisibleRooms().filter(r => r.getMyMembership() === 'invite').length || 0;
    },
    totalDmUnreadCount(): number {
        this.unreadTrigger;
        return this.hierarchy.directMessages.reduce((sum, r) => sum + (r.getUnreadNotificationCount(this.unreadCountType) || 0), 0);
    },
    totalOrphanRoomUnreadCount(): number {
        this.unreadTrigger;
        return this.hierarchy.orphanRooms.reduce((sum, r) => sum + (r.getUnreadNotificationCount(this.unreadCountType) || 0), 0);
    },
    getSpaceUnreadCount: (state) => (spaceId: string) => {
        state.unreadTrigger;
        const client = state.client;
        if (!client) return 0;

        const getRecursiveUnread = (sid: string, visited = new Set<string>()): number => {
            if (visited.has(sid)) return 0;
            visited.add(sid);

            const room = client.getRoom(sid);
            if (!room) return 0;

            let count = 0;
            room.currentState.getStateEvents('m.space.child').forEach(ev => {
                const childId = ev.getStateKey();
                if (childId) {
                    const childRoom = client.getRoom(childId);
                    if (childRoom) {
                        if (childRoom.isSpaceRoom()) {
                            count += getRecursiveUnread(childId, visited);
                        } else {
                            count += childRoom.getUnreadNotificationCount(state.unreadCountType);
                        }
                    }
                }
            });
            return count;
        };

        return getRecursiveUnread(spaceId);
    },
    getVoiceParticipants: (state) => (roomId: string) => {
        const room = state.client?.getRoom(roomId);
        if (!room) return [];
        // Map members who are in the call
        return room.getMembersWithMembership('join')
            .filter(m => {
                const event = room.currentState.getStateEvents('org.matrix.msc3401.call.member', m.userId);
                return event && event.getContent().memberships?.length > 0;
            })
            .map(m => ({
                id: m.userId,
                name: m.name,
                avatarUrl: m.getMxcAvatarUrl()
            }));
    },
    isVerificationRequested: (state) => {
        return !!state.activeVerificationRequest && state.verificationPhase === VerificationPhase.Requested;
    },
    isVerificationReady: (state) => {
        return !!state.activeVerificationRequest && state.verificationPhase === VerificationPhase.Ready;
    },
    isWaitingForRecoveryKey: (state) => {
        return !!state.secretStoragePrompt;
    },
    needsRecoveryKeySetup: (state) => {
        return state.isAuthenticated && !state.isSecretStorageReady && !state.isCryptoDegraded;
    }
  },

  actions: {
    async initialize() {
      this.pushNotificationsEnabled = await getPref('matrix_push_notifications_enabled', true);
      this.showContentInNotifications = await getPref('matrix_show_content_in_notifications', true);
      this.customPushEndpoint = await getPref('matrix_custom_push_endpoint', null);
      this.notificationsQuietUntil = await getPref('matrix_notifications_quiet_until', 0);
      this.lastVisitedRooms = await getPref('matrix_last_visited_rooms', { dm: null, rooms: null, spaces: {} });
    },

    async _clearPersistentStores() {
      const deleteDb = (name: string) => new Promise<void>((resolve) => {
        const req = window.indexedDB.deleteDatabase(name);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });

      await Promise.all([
        'matrix-js-sdk::matrix-store',
        'matrix-js-sdk::matrix-sdk-crypto',
        'matrix-js-sdk::matrix-sdk-crypto-meta',
        'matrix-js-sdk::crypto-store'
      ].map(deleteDb));
    },

    _resetVerificationState() {
      this.activeVerificationRequest = null;
      this.isVerificationInitiatedByMe = false;
      this.activeSas = null;
      this.qrCodeData = null;
      this.isVerificationCompleted = false;
      this.verificationPhase = null;
      this.isRestoringHistory = false;
    },

    setIdle(idle: boolean) {
      this.isIdle = idle;
    },

    async setPushNotificationsEnabled(enabled: boolean) {
      this.pushNotificationsEnabled = enabled;
      await setPref('matrix_push_notifications_enabled', enabled);
    },

    async setShowContentInNotifications(show: boolean) {
      this.showContentInNotifications = show;
      await setPref('matrix_show_content_in_notifications', show);
    },

    async setCustomPushEndpoint(endpoint: string | null) {
      this.customPushEndpoint = endpoint;
      await setPref('matrix_custom_push_endpoint', endpoint);
    },

    async setNotificationsQuietUntil(until: number) {
      this.notificationsQuietUntil = until;
      await setPref('matrix_notifications_quiet_until', until);
    },

    async setCustomStatus(status: string | null) {
        this.customStatus = status;
        if (this.client) {
            await this.client.setAccountData('cc.jackg.ruby.status' as any, { status_msg: status } as any);
        }
    },

    async startLogin(homeserver: string) {
        this.isLoggingIn = true;
        this.loginStatus = 'Discovering homeserver...';
        try {
            const hsUrl = homeserver.startsWith('http') ? homeserver : `https://${homeserver}`;
            const config = await getOidcConfig(hsUrl);
            const clientId = await registerClient(config);
            const nonce = Math.random().toString(36).substring(7);
            const loginUrl = await getLoginUrl(config, clientId, nonce, undefined, hsUrl);
            window.location.href = loginUrl;
        } catch (e: any) {
            this.isLoggingIn = false;
            throw e;
        }
    },

    async setPinnedSpaces(spaceIds: string[]) {
        this.pinnedSpaces = spaceIds;
        if (this.client) {
            await this.client.setAccountData('cc.jackg.ruby.pinned_spaces' as any, { rooms: spaceIds } as any);
        }
    },

    updateRootSpacesOrder(spaceIds: string[]) {
        const uiStore = useUIStore();
        uiStore.uiOrder.rootSpaces = spaceIds;
        setPref('matrix_ui_order', uiStore.uiOrder);
    },

    async fetchSpaceHierarchy(spaceId: string) {
        if (!this.client) return;
        try {
            // @ts-ignore - newer versions of SDK have this, or it's provided by a plugin
            const hierarchy = await this.client.getSpaceSummary(spaceId);
            this.spaceHierarchies[spaceId] = hierarchy.rooms;
            this.hierarchyTrigger++;
        } catch (e) {
            // Fallback for older SDK or different method name
            try {
               const hierarchy = await (this.client as any).getSpaceHierarchy(spaceId);
               this.spaceHierarchies[spaceId] = hierarchy.rooms;
               this.hierarchyTrigger++;
            } catch (e2) {
               console.error('Failed to fetch space hierarchy', e2);
            }
        }
    },

    updateCategoryOrder(spaceId: string, categoryIds: string[]) {
        const uiStore = useUIStore();
        uiStore.uiOrder.categories[spaceId] = categoryIds;
        setPref('matrix_ui_order', uiStore.uiOrder);
    },

    updateRoomOrder(categoryId: string, roomIds: string[]) {
        const uiStore = useUIStore();
        uiStore.uiOrder.rooms[categoryId] = roomIds;
        setPref('matrix_ui_order', uiStore.uiOrder);
    },

    setInviteRoomId(roomId: string | null) {
        this.inviteRoomId = roomId;
    },

    pinSpace(spaceId: string) {
        if (!this.pinnedSpaces.includes(spaceId)) {
            this.setPinnedSpaces([...this.pinnedSpaces, spaceId]);
        }
    },

    unpinSpace(spaceId: string) {
        this.setPinnedSpaces(this.pinnedSpaces.filter(id => id !== spaceId));
    },

    markAsUnread(roomId: string) {
        this.manualUnread[roomId] = true;
        this.unreadTrigger++;
    }
  }
});
