<template>
  <div class="p-6 space-y-8 overflow-y-auto h-full">
    <MusicSection
      title="Popular Albums"
      :items="topAlbums"
      :loading="loading.top"
    />

    <MusicSection
      title="All Albums"
      :items="allAlbums"
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
const topAlbums = ref<BaseItemDto[]>([]);
const allAlbums = ref<BaseItemDto[]>([]);

async function loadAlbums() {
  if (!jellyfinStore.isAuthenticated) return;

  loading.top = true;
  fetcher('/Items', {
    method: 'GET',
    query: {
      IncludeItemTypes: ['MusicAlbum'],
      Recursive: true,
      SortBy: ['PlayCount'],
      SortOrder: 'Descending',
      Limit: 12,
      Fields: ['ArtistItems', 'AlbumArtist', 'PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) topAlbums.value = data.Items as BaseItemDto[];
  }).finally(() => loading.top = false);

  loading.all = true;
  fetcher('/Items', {
    method: 'GET',
    query: {
      IncludeItemTypes: ['MusicAlbum'],
      Recursive: true,
      SortBy: ['SortName'],
      SortOrder: 'Ascending',
      Limit: 100,
      Fields: ['ArtistItems', 'AlbumArtist', 'PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) allAlbums.value = data.Items as BaseItemDto[];
  }).finally(() => loading.all = false);
}

onMounted(() => {
  loadAlbums();
});
</script>
