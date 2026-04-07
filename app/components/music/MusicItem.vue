<template>
  <div
    class="group relative flex flex-col gap-2 p-2 rounded-lg hover:bg-accent/50 transition-all cursor-pointer content-visibility-auto"
    style="contain-intrinsic-size: 0 240px;"
    @click="handleClick"
    @contextmenu.capture="matrixStore.openMusicItemContextMenu(item)"
  >
    <div class="aspect-square rounded-lg overflow-hidden bg-muted shadow-sm relative">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        alt=""
        loading="lazy"
      />
      <div v-else class="h-full w-full flex items-center justify-center">
        <Icon
          :name="item.Type === 'Artist' ? 'solar:user-bold' : 'solar:music-note-bold'"
          class="h-12 w-12 text-muted-foreground/30"
        />
      </div>

      <div
        v-if="item.Type === 'Audio' || item.Type === 'MusicAlbum' || item.Type === 'Playlist'"
        class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
      >
        <UiButton
          size="icon"
          variant="secondary"
          class="rounded-full shadow-lg scale-90 group-hover:scale-100 transition-transform active:scale-95"
          @click.stop="() => { if (!isShuffling) play(item); }"
          @mousedown="startHoldTimer(item)"
          @mouseup="clearHoldTimer"
          @mouseleave="clearHoldTimer"
          @touchstart.passive="startHoldTimer(item)"
          @touchend="clearHoldTimer"
          title="Play (Hold to Shuffle)"
        >
          <Icon :name="isShuffling ? 'solar:shuffle-bold' : 'solar:play-bold'" class="h-6 w-6 ml-0.5 text-[#AA5CC3]" />
        </UiButton>
        <UiButton v-if="item.Type === 'Audio'" size="icon-sm" variant="secondary" class="rounded-full shadow-lg scale-90 group-hover:scale-100 transition-transform" @click.stop="addToQueue" title="Add to Queue">
          <Icon name="solar:list-plus-bold" class="h-4 w-4 text-[#AA5CC3]" />
        </UiButton>
      </div>
    </div>
    <div class="flex flex-col min-w-0">
      <span class="text-sm font-semibold truncate text-foreground group-hover:text-[#AA5CC3] transition-colors">{{ item.Name }}</span>
      <span class="text-xs text-muted-foreground truncate">
        {{ subText }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BaseItemDto } from '~/types/jellyfin';
import { useJellyfinStore } from '~/stores/jellyfin';
import { useMusicStore } from '~/stores/music';
import { useJellyfin } from '~/composables/useJellyfin';

const props = defineProps<{
  item: BaseItemDto;
}>();

const jellyfinStore = useJellyfinStore();
const musicStore = useMusicStore();
const matrixStore = useMatrixStore();
const { fetcher } = useJellyfin();

let holdTimer: any = null;
const isShuffling = ref(false);

const imageUrl = computed(() => {
  if (props.item.ImageTags?.Primary) {
    return `${jellyfinStore.serverUrl}/Items/${props.item.Id}/Images/Primary?tag=${props.item.ImageTags.Primary}&maxWidth=300&api_key=${jellyfinStore.accessToken}`;
  }
  return null;
});

const subText = computed(() => {
  if (props.item.Type === 'Artist') return 'Artist';
  if (props.item.Type === 'MusicAlbum') {
    const artist = props.item.AlbumArtist || props.item.ArtistItems?.[0]?.Name || 'Unknown Artist';
    return `${artist}${props.item.ProductionYear ? ` • ${props.item.ProductionYear}` : ''}`;
  }
  return props.item.ArtistItems?.[0]?.Name || props.item.AlbumArtist || 'Unknown Artist';
});

function handleClick() {
  if (props.item.Type === 'Audio') {
    // Navigate to the album the song is in if available
    if (props.item.AlbumId) {
      navigateTo(`/chat/music/albums/${props.item.AlbumId}`);
    }
  } else if (props.item.Type === 'Artist' || props.item.Type === 'MusicArtist') {
    navigateTo(`/chat/music/artists/${props.item.Id}`);
  } else if (props.item.Type === 'MusicAlbum') {
    navigateTo(`/chat/music/albums/${props.item.Id}`);
  } else if (props.item.Type === 'Playlist') {
    navigateTo(`/chat/music/playlist/${props.item.Id}`);
  }
}

async function play(item: BaseItemDto, shuffle = false) {
  if (item.Type === 'Audio') {
    const song = mapToSong(item);
    if (song) musicStore.playSong(song);
  } else if (item.Type === 'MusicAlbum' || item.Type === 'Playlist' || item.Type === 'Artist') {
    try {
      const query: any = {
        IncludeItemTypes: ['Audio'],
        Recursive: true,
        Fields: ['ArtistItems', 'PrimaryImageAspectRatio', 'UserData', 'Album']
      };

      if (item.Type === 'Artist') {
        query.ArtistIds = [item.Id];
      } else {
        query.ParentId = item.Id;
      }

      const data = await fetcher('/Items', {
        method: 'GET',
        query
      });

      if (data && 'Items' in data && Array.isArray(data.Items) && data.Items.length > 0) {
        let songs = data.Items.map(t => mapToSong(t)).filter((s): s is any => !!s);

        if (shuffle) {
          songs = songs.sort(() => Math.random() - 0.5);
        }

        if (songs.length > 0) {
          musicStore.playSong(songs[0]);
          if (songs.length > 1) {
            musicStore.addToQueue(songs.slice(1));
          }
        }
      }
    } catch (e) {
      console.error('[MusicItem] Failed to play collection:', e);
    }
  }
}

function startHoldTimer(item: BaseItemDto) {
  holdTimer = setTimeout(() => {
    isShuffling.value = true;
    play(item, true);
    setTimeout(() => { isShuffling.value = false; }, 1000);
    holdTimer = null;
  }, 600);
}

function clearHoldTimer() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

async function addToQueue() {
  if (props.item.Type === 'Audio') {
    const song = mapToSong(props.item);
    if (song) musicStore.addToQueue(song);
  } else if (props.item.Type === 'MusicAlbum' || props.item.Type === 'Playlist' || props.item.Type === 'Artist') {
    try {
      const query: any = {
        IncludeItemTypes: ['Audio'],
        Recursive: true,
        Fields: ['ArtistItems', 'PrimaryImageAspectRatio', 'UserData', 'Album']
      };

      if (props.item.Type === 'Artist') {
        query.ArtistIds = [props.item.Id];
      } else {
        query.ParentId = props.item.Id;
      }

      const data = await fetcher('/Items', {
        method: 'GET',
        query
      });
      if (data && 'Items' in data && Array.isArray(data.Items)) {
        const songs = data.Items.map(t => mapToSong(t)).filter((s): s is any => !!s);
        if (songs.length > 0) {
          musicStore.addToQueue(songs);
        }
      }
    } catch (e) {
      console.error('[MusicItem] Failed to add collection to queue:', e);
    }
  }
}

function mapToSong(item: BaseItemDto) {
  if (!item.Id || !item.Name) return null;
  const streamUrl = `${jellyfinStore.serverUrl}/Audio/${item.Id}/stream?static=true&api_key=${jellyfinStore.accessToken}`;

  return {
    id: item.Id,
    title: item.Name,
    artist: item.ArtistItems?.[0]?.Name || 'Unknown Artist',
    album: item.Album || undefined,
    albumArtist: item.AlbumArtist || undefined,
    coverUrl: imageUrl.value || undefined,
    streamUrl
  };
}
</script>
