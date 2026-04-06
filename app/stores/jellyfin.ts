import { defineStore } from 'pinia';
import { setSecret, getSecret, deleteSecret } from '~/composables/useAppStorage';

export interface JellyfinState {
  serverUrl: string | null;
  accessToken: string | null;
  userId: string | null;
  deviceId: string | null;
  clientName: string;
  deviceName: string;
  version: string;
}

export const useJellyfinStore = defineStore('jellyfin', {
  state: (): JellyfinState => ({
    serverUrl: null,
    accessToken: null,
    userId: null,
    deviceId: 'Tumult-Desktop-Device',
    clientName: 'Tumult',
    deviceName: 'Tumult Desktop',
    version: '0.1.0',
  }),

  getters: {
    isAuthenticated: (state) => !!state.accessToken && !!state.serverUrl,
    authHeader: (state) => {
      const parts = [
        `Client="${state.clientName}"`,
        `Device="${state.deviceName}"`,
        `DeviceId="${state.deviceId}"`,
        `Version="${state.version}"`
      ];
      if (state.accessToken) {
        parts.push(`Token="${state.accessToken}"`);
      }
      return `MediaBrowser ${parts.join(', ')}`;
    }
  },

  actions: {
    async init() {
      this.serverUrl = await getSecret('jellyfin_server_url');
      this.accessToken = await getSecret('jellyfin_access_token');
      this.userId = await getSecret('jellyfin_user_id');

      // If we have a stored config, we should ideally verify it
      if (this.isAuthenticated) {
        console.log('[JellyfinStore] Initialized with stored credentials');
      }
    },

    async setCredentials(url: string, token: string, userId: string) {
      this.serverUrl = url;
      this.accessToken = token;
      this.userId = userId;

      await setSecret('jellyfin_server_url', url);
      await setSecret('jellyfin_access_token', token);
      await setSecret('jellyfin_user_id', userId);
    },

    async logout() {
      this.serverUrl = null;
      this.accessToken = null;
      this.userId = null;

      await deleteSecret('jellyfin_server_url');
      await deleteSecret('jellyfin_access_token');
      await deleteSecret('jellyfin_user_id');
    }
  }
});
