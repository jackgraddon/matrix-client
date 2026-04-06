import type { paths } from '~/types/jellyfin';
import type { FetchOptions } from 'ofetch';

export default defineNuxtPlugin(() => {
  const jellyfinStore = useJellyfinStore();
  const { $isTauri } = useNuxtApp();

  const jellyfinFetch = $fetch.create({
    get baseURL() {
      return jellyfinStore.serverUrl || '';
    },
    retry: 0,
    async onRequest({ options }) {
      // Add authentication headers
      options.headers = {
        ...options.headers,
        'X-Emby-Authorization': jellyfinStore.authHeader,
        'Accept': 'application/json',
      };

      // CORS bypass for Tauri
      if ($isTauri) {
        try {
          const { fetch } = await import('@tauri-apps/plugin-http');
          // @ts-ignore
          options.fetch = (url, init) => fetch(url, init);
        } catch (e) {
          console.error('[Jellyfin Plugin] Failed to load Tauri HTTP plugin', e);
        }
      }
    },
    onResponseError({ response }) {
      console.error('[Jellyfin Plugin] API Error:', response.status, response._data);
    }
  });

  // Provide the typed fetcher globally
  return {
    provide: {
      jellyfin: jellyfinFetch as typeof jellyfinFetch & {
        <T extends keyof paths>(
          url: T,
          options?: FetchOptions<'json'> & { method?: string; query?: any; body?: any }
        ): Promise<any>
      }
    }
  };
});
