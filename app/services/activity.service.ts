import { useActivityStore } from '~/stores/activity';
import { getPref, setPref } from '~/composables/useAppStorage';

export class ActivityService {
  private static instance: ActivityService;

  private constructor() {}

  public static getInstance(): ActivityService {
    if (!ActivityService.instance) {
      ActivityService.instance = new ActivityService();
    }
    return ActivityService.instance;
  }

  async init() {
    const store = useActivityStore();
    const stored = await getPref('game_detection_level', 'off');
    console.log('[ActivityService] Loading game detection config:', stored);
    store.setGameDetectionLevel(stored as any);

    const isTauri = (process as any).client && !!(window as any).__TAURI_INTERNALS__;
    if (isTauri) {
      const { listen } = await import('@tauri-apps/api/event');

      listen('game-activity', (event: any) => {
        console.log('[ActivityService] Game activity event (Basic):', event.payload);
        const { name, exe, is_running } = event.payload;
        if (is_running) {
          store.setActivityDetails({
            name: name + (exe ? ` (via ${exe})` : ''),
            is_running: true,
            last_updated: Date.now()
          });
        } else {
          if (store.activityDetails?.name === name) {
            store.setActivityDetails(null);
          }
        }
      });

      listen('arrpc-activity', (event: any) => {
        console.log('[ActivityService] Received rsRPC activity:', event.payload);
        this.handleRpcActivity(event.payload);
      });
    }

    if (store.gameDetectionLevel !== 'off') {
      this.setGameDetectionLevel(store.gameDetectionLevel);
    }
  }

  async fetchDetectableGames() {
    const store = useActivityStore();
    if (store.detectableGames.length > 0) return store.detectableGames;
    try {
      const res = await fetch('https://discord.com/api/v9/applications/detectable');
      if (res.ok) {
        const games = await res.json();
        store.setDetectableGames(games);
        return games;
      }
    } catch (e) {
      console.error('[ActivityService] Failed to fetch games:', e);
    }
    return [];
  }

  async setGameDetectionLevel(level: 'off' | 'basic' | 'advanced') {
    const store = useActivityStore();
    store.setGameDetectionLevel(level);
    await setPref('game_detection_level', level);

    const isTauri = (process as any).client && !!(window as any).__TAURI_INTERNALS__;

    await this.stopRpcServer();
    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_scanner_enabled', { enabled: false });
    }

    if (level === 'basic' && isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      const { platform } = await import('@tauri-apps/plugin-os');
      const games = await this.fetchDetectableGames();
      const os = platform();

      const filtered = games.map((g: any) => ({
        id: g.id,
        name: g.name,
        executables: (g.executables || []).filter((e: any) => {
          if (os === 'windows') return e.os === 'win32';
          if (os === 'macos') return e.os === 'darwin';
          return e.os === 'linux';
        })
      })).filter((g: any) => g.executables.length > 0);

      await invoke('update_watch_list', { games: filtered });
      await invoke('set_scanner_enabled', { enabled: true });
    } else if (level === 'advanced') {
      await this.startRpcServer();
    }
  }

  async startRpcServer() {
    if (!((process as any).client && !!(window as any).__TAURI_INTERNALS__)) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('start_rsrpc_server', { bridgePort: 1337, noProcessScanning: false });
    } catch (e) {}
  }

  async stopRpcServer() {
    if (!((process as any).client && !!(window as any).__TAURI_INTERNALS__)) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_rsrpc_server');
      useActivityStore().setActivityDetails(null);
    } catch (e) {}
  }

  public async handleRpcActivity(data: any) {
    const store = useActivityStore();
    if (data.activity) {
      let name = this.sanitize(data.activity.name);
      const details = this.sanitize(data.activity.details);
      const appId = data.activity.application_id;

      let largeImage = data.activity.assets?.large_image;
      let smallImage = data.activity.assets?.small_image;

      if (appId) {
        const [appInfo, assets] = await Promise.all([
          this.resolveAppInfo(appId),
          this.resolveAssets(appId)
        ]);
        if (appInfo) name = appInfo.name || name;
        if (largeImage && assets[largeImage]) largeImage = assets[largeImage];
        if (smallImage && assets[smallImage]) smallImage = assets[smallImage];
      }

      store.setActivityDetails({
        name: name || details || 'a game',
        details,
        state: this.sanitize(data.activity.state),
        applicationId: appId,
        iconHash: largeImage,
        smallIconHash: smallImage,
        startTimestamp: data.activity.timestamps?.start,
        is_running: true,
        last_updated: Date.now()
      });
    } else {
      store.setActivityDetails(null);
    }
  }

  private sanitize(val: any): string | undefined {
    if (val === null || val === undefined) return undefined;
    const s = String(val).trim();
    if (!s || s === 'undefined' || s === 'null' || s === 'None') return undefined;
    return s;
  }

  async resolveAppInfo(appId: string) {
    const store = useActivityStore();
    if (store.appCache[appId]) return store.appCache[appId];
    try {
      const res = await fetch(`https://discord.com/api/v9/applications/${appId}/rpc`);
      if (res.ok) {
        const data = await res.json();
        store.cacheAppInfo(appId, { name: data.name, icon: data.icon });
        return store.appCache[appId];
      }
    } catch (e) {}
    return null;
  }

  async resolveAssets(appId: string) {
    const store = useActivityStore();
    if (store.assetCache[appId]) return store.assetCache[appId];
    try {
      const res = await fetch(`https://discord.com/api/v9/oauth2/applications/${appId}/assets`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        if (Array.isArray(data)) data.forEach((a: any) => map[a.name] = a.id);
        store.cacheAssets(appId, map);
        return map;
      }
    } catch (e) {}
    return {};
  }
}
