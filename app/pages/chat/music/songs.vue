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

  loading.top = true;
  fetcher('/Items', {
    method: 'GET',
    query: {
      IncludeItemTypes: ['Audio'],
      Recursive: true,
      SortBy: ['PlayCount'],
      SortOrder: 'Descending',
      Limit: 12,
      Fields: ['ArtistItems', 'PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) topSongs.value = data.Items as BaseItemDto[];
  }).finally(() => loading.top = false);

  loading.all = true;
  fetcher('/Items', {
    method: 'GET',
    query: {
      IncludeItemTypes: ['Audio'],
      Recursive: true,
      SortBy: ['SortName'],
      SortOrder: 'Ascending',
      Limit: 100,
      Fields: ['ArtistItems', 'PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) allSongs.value = data.Items as BaseItemDto[];
  }).finally(() => loading.all = false);
}

onMounted(() => {
  loadSongs();
});
</script>
