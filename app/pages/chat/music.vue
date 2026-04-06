<template>
  <div class="flex flex-col h-full bg-background">
    <header class="flex items-center h-12 p-2 border-b border-border">
      <UiButton variant="ghost" size="icon" class="md:hidden" @click="matrixStore.toggleSidebar(true)">
        <Icon name="solar:hamburger-menu-linear" />
      </UiButton>
      <h1 class="text-lg font-semibold ml-2">Music Library</h1>
      <div class="ml-auto flex items-center gap-2">
        <UiInput v-model="searchQuery" placeholder="Search music..." class="h-8 w-64" @keyup.enter="search" />
        <UiButton size="sm" @click="search">Search</UiButton>
      </div>
    </header>

    <main class="flex-1 overflow-y-auto p-4">
      <div v-if="loading" class="flex items-center justify-center h-full">
        <Icon name="solar:spinner-bold" class="h-8 w-8 animate-spin text-primary" />
      </div>

      <div v-else-if="items.length === 0" class="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Icon name="solar:music-note-broken" class="h-16 w-16 mb-4" />
        <p>No music found in your library.</p>
      </div>

      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        <div
          v-for="item in items"
          :key="item.Id"
          class="group relative flex flex-col gap-2 p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer"
          @click="play(item)"
        >
          <div class="aspect-square rounded-md overflow-hidden bg-muted shadow-sm relative">
            <img
              v-if="getImageUrl(item)"
              :src="getImageUrl(item)"
              class="h-full w-full object-cover transition-transform group-hover:scale-105"
              alt=""
            />
            <div v-else class="h-full w-full flex items-center justify-center">
              <Icon name="solar:music-note-bold" class="h-12 w-12 text-muted-foreground/50" />
            </div>

            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <UiButton size="icon" variant="secondary" class="rounded-full shadow-lg">
                <Icon name="solar:play-bold" class="h-6 w-6 ml-1" />
              </UiButton>
            </div>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-semibold truncate">{{ item.Name }}</span>
            <span class="text-xs text-muted-foreground truncate">{{ item.ArtistItems?.[0]?.Name || 'Unknown Artist' }}</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useJellyfin } from '~/composables/useJellyfin';
import { useJellyfinStore } from '~/stores/jellyfin';
import { useMusicStore } from '~/stores/music';

const matrixStore = useMatrixStore();
const jellyfinStore = useJellyfinStore();
const musicStore = useMusicStore();
const { fetcher } = useJellyfin();

import type { BaseItemDto } from '~/types/jellyfin';

const loading = ref(false);
const items = ref<BaseItemDto[]>([]);
const searchQuery = ref('');

async function loadLibrary() {
  if (!jellyfinStore.isAuthenticated) return;
  loading.value = true;
  try {
    const data = await fetcher('/Items', {
      method: 'GET',
      query: {
        IncludeItemTypes: ['Audio'],
        Recursive: true,
        Limit: 100,
        Fields: ['ArtistItems', 'AlbumArtist', 'PrimaryImageAspectRatio'],
        SortBy: ['Random']
      }
    });

    if (data && 'Items' in data) {
      items.value = data.Items as BaseItemDto[];
    }
  } catch (e) {
    console.error('Failed to load library:', e);
  } finally {
    loading.value = false;
  }
}

async function search() {
  if (!searchQuery.value) {
    loadLibrary();
    return;
  }

  loading.value = true;
  try {
    const data = await fetcher('/Items', {
      method: 'GET',
      query: {
        SearchTerm: searchQuery.value,
        IncludeItemTypes: ['Audio'],
        Recursive: true,
        Fields: ['ArtistItems', 'AlbumArtist', 'PrimaryImageAspectRatio']
      }
    });

    if (data && 'Items' in data) {
      items.value = data.Items as BaseItemDto[];
    }
  } catch (e) {
    console.error('Failed to search library:', e);
  } finally {
    loading.value = false;
  }
}

function getImageUrl(item: BaseItemDto) {
  if (item.ImageTags?.Primary) {
    return `${jellyfinStore.serverUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}&maxWidth=300`;
  }
  return null;
}

function play(item: BaseItemDto) {
  if (!item.Id || !item.Name) return;
  const streamUrl = `${jellyfinStore.serverUrl}/Audio/${item.Id}/stream?static=true&api_key=${jellyfinStore.accessToken}`;

  musicStore.playSong({
    id: item.Id,
    title: item.Name,
    artist: item.ArtistItems?.[0]?.Name || 'Unknown Artist',
    album: item.Album || undefined,
    albumArtist: item.AlbumArtist || undefined,
    coverUrl: getImageUrl(item) || undefined,
    streamUrl
  });
}

onMounted(() => {
  loadLibrary();
});
</script>
