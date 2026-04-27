import { watch } from 'vue';
import { useMatrixStore } from '~/stores/matrix';
import { useActivityStore } from '~/stores/activity';
import { MatrixService } from './matrix.service';

export class PresenceService {
  private static instance: PresenceService;
  private lastUpdate = 0;
  private lastState: { presence: string; status: string } | null = null;

  private constructor() {
    if (import.meta.client) this.setupObservers();
  }

  public static getInstance(): PresenceService {
    if (!PresenceService.instance) PresenceService.instance = new PresenceService();
    return PresenceService.instance;
  }

  private setupObservers() {
    const activityStore = useActivityStore();
    const matrixStore = useMatrixStore();

    watch(() => activityStore.gameTrigger, () => this.refreshPresence());
    watch(() => matrixStore.isIdle, () => this.refreshPresence());
    watch(() => matrixStore.customStatus, () => this.refreshPresence());
  }

  async refreshPresence() {
    const matrixStore = useMatrixStore();
    const activityStore = useActivityStore();
    const client = MatrixService.getInstance().getClient();

    if (!client || !matrixStore.isAuthenticated || !matrixStore.isClientReady) return;

    const game = activityStore.activityDetails;
    const music = activityStore.musicActivity;
    const best = (game?.is_running && !game?.is_paused) ? game : (music || game);
    const hasLive = (game?.is_running && !game?.is_paused) || (music?.is_running && !music?.is_paused);

    const presence = (matrixStore.isIdle && !hasLive) ? 'unavailable' : 'online';
    let status = matrixStore.customStatus || '';

    if (!status && best?.is_running) {
      status = JSON.stringify({
        playing: best.name,
        details: best.details,
        state: best.state,
        applicationId: best.applicationId,
        iconHash: best.iconHash,
        smallIconHash: best.smallIconHash,
        startTimestamp: best.startTimestamp,
        duration: best.duration,
        currentTime: best.currentTime,
        coverUrl: best.coverUrl,
        type: best.type || 'game',
        is_running: true,
        is_paused: best.is_paused ?? false,
        game: game?.is_running ? { ...game, type: 'game' } : null,
        music: music?.is_running ? { ...music, type: 'music' } : null
      });
    }

    const now = Date.now();
    const changed = !this.lastState || this.lastState.presence !== presence || this.lastState.status !== status;

    // Simple bypass for critical music state changes
    let isCritical = false;
    if (changed && this.lastState && status.startsWith('{') && this.lastState.status.startsWith('{')) {
        const curr = JSON.parse(status);
        const last = JSON.parse(this.lastState.status);
        if (curr.type === 'music' && (curr.playing !== last.playing || curr.is_paused !== last.is_paused)) isCritical = true;
    }

    if (!changed || (!isCritical && (now - this.lastUpdate < 20000))) {
        if (now - this.lastUpdate < 20000) return;
    }

    try {
      await client.setPresence({ presence: presence as any, status_msg: status });
      this.lastUpdate = now;
      this.lastState = { presence, status };
      console.log(`[PresenceService] Updated: ${presence}`);
    } catch (e) {}
  }
}
