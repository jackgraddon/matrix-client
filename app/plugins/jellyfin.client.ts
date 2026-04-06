import type { paths } from '~/types/jellyfin';
import type { FetchOptions } from 'ofetch';

export default defineNuxtPlugin(() => {
  const jellyfinStore = useJellyfinStore();
  const { $isTauri } = useNuxtApp();

  const jellyfinFetch = $fetch.create({
    retry: 0,
    async onRequest({ options }) {
      // Dynamically set baseURL if not already set on this request
      // We also check if the url is a full URL. If not, prepend baseURL.
      if (jellyfinStore.serverUrl && !options.url.startsWith('http')) {
        options.baseURL = jellyfinStore.serverUrl;
      }

      console.log(`[Jellyfin] Requesting: ${options.baseURL || ''}${options.url}`);

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
