<template>
  <div class="p-6 space-y-8 overflow-y-auto h-full">
    <MusicSection
      title="Most Played Tracks"
      :items="topSongs"
      :loading="loading.top"
    />

    <MusicSection
      title="All Songs"
      :items="allSongs"
      :loading="loading.all"
      layout="grid"
    />
  </div>
</template>

<script setup lang="ts">
import { useJellyfin } from '~/composables/useJellyfin';
import { useJellyfinStore } from '~/stores/jellyfin';
import type { BaseItemDto } from '~/types/jellyfin';
import MusicSection from '~/components/music/MusicSection.vue';

const { fetcher } = useJellyfin();
const jellyfinStore = useJellyfinStore();

const loading = reactive({ top: false, all: false });
const topSongs = ref<BaseItemDto[]>([]);
const allSongs = ref<BaseItemDto[]>([]);

async function loadSongs() {
  if (!jellyfinStore.isAuthenticated) return;

  const cacheKey = `music_songs_${jellyfinStore.userId}`;
  const cached = jellyfinStore.getCached(cacheKey);
  if (cached) {
    topSongs.value = cached.topSongs;
    allSongs.value = cached.allSongs;
    return;
  }

  loading.top = true;
  const p1 = fetcher('/Items', {
    method: 'GET',
    query: {
      IncludeItemTypes: ['Audio'],
      Recursive: true,
      SortBy: ['PlayCount'],
      SortOrder: 'Descending',
      Limit: 12,
      Fields: ['ArtistItems', 'PrimaryImageAspectRatio', 'UserData']
    }
  }).then(data => {
    if (data && 'Items' in data) topSongs.value = data.Items as BaseItemDto[];
  }).finally(() => loading.top = false);

  loading.all = true;
  const p2 = fetcher('/Items', {
    method: 'GET',
    query: {
      IncludeItemTypes: ['Audio'],
      Recursive: true,
      SortBy: ['SortName'],
      SortOrder: 'Ascending',
      Limit: 100,
      Fields: ['ArtistItems', 'PrimaryImageAspectRatio', 'UserData']
    }
  }).then(data => {
    if (data && 'Items' in data) allSongs.value = data.Items as BaseItemDto[];
  }).finally(() => loading.all = false);

  Promise.all([p1, p2]).then(() => {
    jellyfinStore.setCached(cacheKey, {
      topSongs: topSongs.value,
      allSongs: allSongs.value
    });
  });
}

onMounted(() => {
  loadSongs();
});
</script>
