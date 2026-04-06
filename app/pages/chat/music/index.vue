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

  // Most Played
  loading.mostPlayed = true;
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
    if (data && 'Items' in data) mostPlayed.value = data.Items as BaseItemDto[];
  }).finally(() => loading.mostPlayed = false);

  // Explore (Random)
  loading.explore = true;
  fetcher('/Items', {
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
  fetcher('/Items', {
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
  fetcher(`/Users/${jellyfinStore.userId}/Items`, {
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
}

onMounted(() => {
  loadHome();
});
</script>
