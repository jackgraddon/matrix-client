<template>
  <div class="p-6 space-y-8 overflow-y-auto h-full">
    <div class="space-y-1">
      <h2 class="text-3xl font-bold tracking-tight text-foreground">Favorites</h2>
      <p class="text-muted-foreground">Your most loved tracks and albums.</p>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <Icon name="lucide:loader-2" class="h-12 w-12 animate-spin text-[#AA5CC3]" />
    </div>

    <div v-else-if="isEmpty" class="flex flex-col items-center justify-center py-24 text-muted-foreground space-y-4">
      <Icon name="solar:heart-bold-duotone" class="h-24 w-24 opacity-20 text-[#AA5CC3]" />
      <p class="text-xl font-medium">You haven't favorited anything yet.</p>
      <UiButton variant="outline" @click="navigateTo('/chat/music')">Explore Music</UiButton>
    </div>

    <template v-else>
      <MusicSection
        v-if="albums.length > 0"
        title="Favorite Albums"
        :items="albums"
      />

      <MusicSection
        v-if="songs.length > 0"
        title="Favorite Songs"
        :items="songs"
        layout="grid"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useJellyfin } from '~/composables/useJellyfin';
import { useJellyfinStore } from '~/stores/jellyfin';
import type { BaseItemDto } from '~/types/jellyfin';
import MusicSection from '~/components/music/MusicSection.vue';

const { fetcher } = useJellyfin();
const jellyfinStore = useJellyfinStore();

const loading = ref(false);
const albums = ref<BaseItemDto[]>([]);
const songs = ref<BaseItemDto[]>([]);

const isEmpty = computed(() => albums.value.length === 0 && songs.value.length === 0);

async function loadFavorites() {
  if (!jellyfinStore.isAuthenticated) return;

  loading.value = true;
  try {
    const data = await fetcher('/Items', {
      method: 'GET',
      query: {
        Filters: ['IsFavorite'],
        IncludeItemTypes: ['MusicAlbum', 'Audio'],
        Recursive: true,
        Fields: ['ArtistItems', 'AlbumArtist', 'PrimaryImageAspectRatio', 'UserData']
      }
    });

    if (data && 'Items' in data) {
      const allItems = data.Items as BaseItemDto[];
      albums.value = allItems.filter(i => i.Type === 'MusicAlbum');
      songs.value = allItems.filter(i => i.Type === 'Audio');
    }
  } catch (e) {
    console.error('[Favorites] Failed to load favorites:', e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadFavorites();
});
</script>
