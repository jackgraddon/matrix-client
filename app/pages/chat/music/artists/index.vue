<template>
  <div class="p-6 space-y-8 overflow-y-auto h-full">
    <MusicSection
      title="Most Listened To"
      :items="topArtists"
      :loading="loading.top"
    />

    <MusicSection
      title="All Artists"
      :items="allArtists"
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
const topArtists = ref<BaseItemDto[]>([]);
const allArtists = ref<BaseItemDto[]>([]);

async function loadArtists() {
  if (!jellyfinStore.isAuthenticated) return;

  loading.top = true;
  fetcher('/Artists', {
    method: 'GET',
    query: {
      Recursive: true,
      SortBy: ['PlayCount'],
      SortOrder: 'Descending',
      Limit: 12,
      Fields: ['PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) topArtists.value = data.Items as BaseItemDto[];
  }).finally(() => loading.top = false);

  loading.all = true;
  fetcher('/Artists', {
    method: 'GET',
    query: {
      Recursive: true,
      SortBy: ['SortName'],
      SortOrder: 'Ascending',
      Limit: 100, // Reasonable limit for initial load
      Fields: ['PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) allArtists.value = data.Items as BaseItemDto[];
  }).finally(() => loading.all = false);
}

onMounted(() => {
  loadArtists();
});
</script>
