import { defineStore } from 'pinia';
import { useActivityStore, type Activity } from './activity';
import { useMatrixStore } from './matrix';

export const usePresenceStore = defineStore('presence', {
  actions: {
    resolveActivities(userId: string | null): { game: Activity | null; music: Activity | null } {
      const activityStore = useActivityStore();
      const matrixStore = useMatrixStore();

      const currentUserId = matrixStore.user?.userId || matrixStore.client?.getUserId();
      const targetUserId = userId || currentUserId;
      if (!targetUserId) return { game: null, music: null };

      const isSelf = targetUserId === currentUserId;
      let game: Activity | null = null;
      let music: Activity | null = null;

      if (isSelf) {
        if (activityStore.activityDetails?.is_running) game = activityStore.activityDetails;
        if (activityStore.musicActivity?.is_running) music = activityStore.musicActivity;
      }

      const remote = activityStore.remoteActivityDetails[targetUserId];
      if (remote) {
        const now = Date.now();
        const fresh = (ts?: number) => ts && (now - ts < 5 * 60 * 1000);
        if (remote.game?.is_running && fresh(remote.game.last_updated)) game = game || remote.game;
        if (remote.music?.is_running && fresh(remote.music.last_updated)) music = music || remote.music;
      }

      // Presence fallback logic
      if (!game || !music) {
        const user = matrixStore.client?.getUser(targetUserId);
        const msg = isSelf && matrixStore.lastPresenceState ? matrixStore.lastPresenceState.status_msg : user?.presenceStatusMsg;
        if (msg?.startsWith('{')) {
          try {
            const p = JSON.parse(msg);
            const act: Activity = {
                name: p.playing,
                details: p.details,
                is_running: true,
                is_paused: p.is_paused,
                type: p.type || (p.playing?.includes(' by ') ? 'music' : 'game'),
                startTimestamp: p.startTimestamp,
                coverUrl: p.coverUrl
            };
            if (act.type === 'music') music = music || act;
            else game = game || act;
          } catch {}
        }
      }

      return { game: game || null, music: music || null };
    }
  }
});
