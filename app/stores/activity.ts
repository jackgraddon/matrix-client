import { defineStore } from 'pinia';

export interface Activity {
  name: string;
  details?: string;
  state?: string;
  applicationId?: string;
  iconHash?: string;
  smallIconHash?: string;
  startTimestamp?: number;
  duration?: number;
  currentTime?: number;
  coverUrl?: string;
  type?: 'game' | 'music';
  is_running: boolean;
  is_paused?: boolean;
  last_updated?: number;
}

export const useActivityStore = defineStore('activity', {
  state: () => ({
    isGameDetectionEnabled: false,
    gameDetectionLevel: 'off' as 'off' | 'basic' | 'advanced',
    detectableGames: [] as any[],
    activityDetails: null as Activity | null,
    musicActivity: null as Activity | null,
    remoteActivityDetails: {} as Record<string, { game?: Activity; music?: Activity }>,
    appCache: {} as Record<string, { name: string; icon: string | null }>,
    assetCache: {} as Record<string, Record<string, string>>,
    gameTrigger: 0,
    gameStates: {} as Record<string, any>,
  }),

  actions: {
    setActivityDetails(details: Activity | null) {
      this.activityDetails = details;
      this.gameTrigger++;
    },

    setMusicActivity(activity: Activity | null) {
      this.musicActivity = activity;
      this.gameTrigger++;
    },

    setRemoteActivity(userId: string, type: 'game' | 'music', activity: Activity | null) {
      if (!this.remoteActivityDetails[userId]) {
        this.remoteActivityDetails[userId] = {};
      }
      if (activity) {
        this.remoteActivityDetails[userId][type] = activity;
      } else {
        delete this.remoteActivityDetails[userId][type];
      }
      this.gameTrigger++;
    },

    clearRemoteActivity(userId: string) {
      delete this.remoteActivityDetails[userId];
      this.gameTrigger++;
    },

    updateGameState(gameId: string, state: any) {
        this.gameStates[gameId] = state;
        this.gameTrigger++;
    },

    setDetectableGames(games: any[]) {
      this.detectableGames = games;
    },

    setGameDetectionLevel(level: 'off' | 'basic' | 'advanced') {
      this.gameDetectionLevel = level;
    },

    cacheAppInfo(appId: string, info: { name: string, icon: string | null }) {
      this.appCache[appId] = info;
    },

    cacheAssets(appId: string, assets: Record<string, string>) {
      this.assetCache[appId] = assets;
    }
  }
});
