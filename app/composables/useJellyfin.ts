import { createUseFetch } from '#app/composables/fetch';
import type { paths } from '~/types/jellyfin';
import { useJellyfinStore } from '~/stores/jellyfin';

export const useJellyfin = () => {
  const { $isTauri } = useNuxtApp();
  const jellyfinStore = useJellyfinStore();

  const fetcher = createUseFetch<paths>({
    get baseUrl() {
      return jellyfinStore.serverUrl || '';
    },
    options: {
      get headers() {
        return {
          'X-Emby-Authorization': jellyfinStore.authHeader,
          'Accept': 'application/json',
        };
      },
      async onRequest({ options }) {
        if ($isTauri) {
          try {
            const { fetch } = await import('@tauri-apps/plugin-http');
            // @ts-ignore
            options.fetch = (url, init) => fetch(url, init);
          } catch (e) {
            console.error('Failed to load Tauri HTTP plugin', e);
          }
        }
      }
    }
  });

  return {
    fetcher,
  };
};
