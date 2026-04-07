<template>
  <div class="p-6 space-y-8 overflow-y-auto h-full">
    <div class="space-y-1">
      <h2 class="text-3xl font-bold tracking-tight text-foreground">Search Results</h2>
      <p class="text-muted-foreground">Showing results for "{{ q }}"</p>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <Icon name="lucide:loader-2" class="h-12 w-12 animate-spin text-[#AA5CC3]" />
    </div>

    <div v-else-if="isEmpty" class="flex flex-col items-center justify-center py-24 text-muted-foreground space-y-4">
      <Icon name="solar:magnifer-zoom-out-bold-duotone" class="h-24 w-24 opacity-20" />
      <p class="text-xl font-medium">No matches found for your search.</p>
      <UiButton variant="outline" @click="navigateTo('/chat/music')">Return to Music Home</UiButton>
    </div>

    <template v-else>
      <MusicSection
        v-if="artists.length > 0"
        title="Artists"
        :items="artists"
      />

      <MusicSection
        v-if="albums.length > 0"
        title="Albums"
        :items="albums"
        layout="grid"
      />

      <MusicSection
        v-if="songs.length > 0"
        title="Songs"
        :items="songs"
        layout="grid"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useJellyfin } from '~/composables/useJellyfin';
import { useJellyfinStore } from '~/stores/jellyfin';
import type { BaseItemDto } from '~/types/jellyfin';
import MusicSection from '~/components/music/MusicSection.vue';

const route = useRoute();
const { fetcher } = useJellyfin();
const jellyfinStore = useJellyfinStore();

const q = computed(() => route.query.q as string || '');
const loading = ref(false);
const artists = ref<BaseItemDto[]>([]);
const albums = ref<BaseItemDto[]>([]);
const songs = ref<BaseItemDto[]>([]);

const isEmpty = computed(() => artists.value.length === 0 && albums.value.length === 0 && songs.value.length === 0);

async function performSearch() {
  if (!jellyfinStore.isAuthenticated || !q.value) return;

  loading.value = true;
  try {
    const data = await fetcher('/Items', {
      method: 'GET',
      query: {
        SearchTerm: q.value,
        IncludeItemTypes: ['Artist', 'MusicAlbum', 'Audio'],
        Recursive: true,
        Fields: ['ArtistItems', 'AlbumArtist', 'PrimaryImageAspectRatio', 'UserData']
      }
    });

    if (data && 'Items' in data) {
      const allItems = data.Items as BaseItemDto[];
      artists.value = allItems.filter(i => i.Type === 'Artist');
      albums.value = allItems.filter(i => i.Type === 'MusicAlbum');
      songs.value = allItems.filter(i => i.Type === 'Audio');
    }
  } catch (e) {
    console.error('[Search] Failed to search:', e);
  } finally {
    loading.value = false;
  }
}

watch(q, () => performSearch(), { immediate: true });
</script>
