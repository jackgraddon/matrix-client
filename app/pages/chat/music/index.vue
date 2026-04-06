<template>
  <div class="p-6 space-y-8 overflow-y-auto h-full">
    <!-- Most Played Section -->
    <MusicSection
      title="Most Played"
      :items="mostPlayed"
      :loading="loading.mostPlayed"
    />

    <!-- Explore Section -->
    <MusicSection
      title="Explore"
      :items="explore"
      :loading="loading.explore"
      layout="grid"
    />

    <!-- Recently Added Section -->
    <MusicSection
      title="Recently Added"
      :items="recentlyAdded"
      :loading="loading.recentlyAdded"
    />

    <!-- Recently Played Section -->
    <MusicSection
      title="Recently Played"
      :items="recentlyPlayed"
      :loading="loading.recentlyPlayed"
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

const loading = reactive({
  mostPlayed: false,
  explore: false,
  recentlyAdded: false,
  recentlyPlayed: false
});

const mostPlayed = ref<BaseItemDto[]>([]);
const explore = ref<BaseItemDto[]>([]);
const recentlyAdded = ref<BaseItemDto[]>([]);
const recentlyPlayed = ref<BaseItemDto[]>([]);

async function loadHome() {
  if (!jellyfinStore.isAuthenticated) return;

  const cacheKey = `music_home_${jellyfinStore.userId}`;
  const cached = jellyfinStore.getCached(cacheKey, 10 * 60 * 1000); // 10 minute cache for home
  if (cached) {
    mostPlayed.value = cached.mostPlayed;
    explore.value = cached.explore;
    recentlyAdded.value = cached.recentlyAdded;
    recentlyPlayed.value = cached.recentlyPlayed;
    return;
  }

  // Most Played
  loading.mostPlayed = true;
  const p1 = fetcher('/Items', {
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
    if (data && 'Items' in data) mostPlayed.value = data.Items as BaseItemDto[];
  }).finally(() => loading.mostPlayed = false);

  // Explore (Random)
  loading.explore = true;
  const p2 = fetcher('/Items', {
    method: 'GET',
    query: {
      IncludeItemTypes: ['Audio'],
      Recursive: true,
      SortBy: ['Random'],
      Limit: 12,
      Fields: ['ArtistItems', 'PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) explore.value = data.Items as BaseItemDto[];
  }).finally(() => loading.explore = false);

  // Recently Added
  loading.recentlyAdded = true;
  const p3 = fetcher('/Items', {
    method: 'GET',
    query: {
      IncludeItemTypes: ['Audio'],
      Recursive: true,
      SortBy: ['DateCreated'],
      SortOrder: 'Descending',
      Limit: 12,
      Fields: ['ArtistItems', 'PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) recentlyAdded.value = data.Items as BaseItemDto[];
  }).finally(() => loading.recentlyAdded = false);

  // Recently Played (using Users/Items with SortBy PlayDate)
  loading.recentlyPlayed = true;
  const p4 = fetcher(`/Users/${jellyfinStore.userId}/Items`, {
    method: 'GET',
    query: {
      IncludeItemTypes: ['Audio'],
      Recursive: true,
      SortBy: ['PlayDate'],
      SortOrder: 'Descending',
      Limit: 12,
      Fields: ['ArtistItems', 'PrimaryImageAspectRatio']
    }
  }).then(data => {
    if (data && 'Items' in data) recentlyPlayed.value = data.Items as BaseItemDto[];
  }).finally(() => loading.recentlyPlayed = false);

  // Once all done, cache the result
  Promise.all([p1, p2, p3, p4]).then(() => {
    jellyfinStore.setCached(cacheKey, {
      mostPlayed: mostPlayed.value,
      explore: explore.value,
      recentlyAdded: recentlyAdded.value,
      recentlyPlayed: recentlyPlayed.value
    });
  });
}

onMounted(() => {
  loadHome();
});
</script>
