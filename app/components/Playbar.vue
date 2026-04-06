<template>
  <div v-if="musicStore.currentSong" class="p-2 bg-accent/20 rounded-md border border-border/50 shadow-sm transition-all hover:bg-accent/30 group">
    <div class="flex items-center gap-3 overflow-hidden">
      <!-- Cover Image -->
      <div class="h-10 w-10 shrink-0 rounded-md bg-muted overflow-hidden relative">
        <img
          v-if="musicStore.currentSong.coverUrl"
          :src="musicStore.currentSong.coverUrl"
          class="h-full w-full object-cover"
          alt=""
        />
        <div v-else class="h-full w-full flex items-center justify-center">
          <Icon name="solar:music-note-bold" class="h-6 w-6 text-muted-foreground/30" />
        </div>

        <!-- Play/Pause Overlay -->
        <div
          class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          @click="musicStore.togglePlay"
        >
          <Icon :name="musicStore.isPlaying ? 'solar:pause-bold' : 'solar:play-bold'" class="text-white h-5 w-5" />
        </div>
      </div>

      <!-- Text Details -->
      <div class="flex-1 min-w-0 flex flex-col">
        <span class="text-xs font-bold truncate tracking-tight text-foreground leading-tight">{{ musicStore.currentSong.title }}</span>
        <span class="text-[10px] text-muted-foreground truncate leading-tight">{{ musicStore.currentSong.artist }}</span>
      </div>

      <!-- Controls (Optional small display) -->
      <UiButton variant="ghost" size="icon" class="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" @click="musicStore.togglePlay">
        <Icon :name="musicStore.isPlaying ? 'solar:pause-bold' : 'solar:play-bold'" class="h-4 w-4" />
      </UiButton>
    </div>

    <!-- Progress Bar -->
    <div class="mt-2 h-1 bg-muted rounded-full overflow-hidden">
      <div
        class="h-full bg-[#AA5CC3] transition-all duration-300"
        :style="{ width: `${progress}%` }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMusicStore } from '~/stores/music';

const musicStore = useMusicStore();

const progress = computed(() => {
  if (!musicStore.audioElement?.duration) return 0;
  return (musicStore.currentTime / musicStore.audioElement.duration) * 100;
});
</script>
