<template>
  <div v-if="variant === 'small'" class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
    <Icon name="solar:gamepad-bold" class="w-4 h-4 text-emerald-500" />
    <span>Playing <span class="text-foreground">{{ game.name }}</span></span>
  </div>

  <div v-else-if="variant === 'large'" class="relative flex flex-col p-3.5 bg-card border border-border rounded-xl shadow-sm w-full max-w-sm">
    <div class="flex items-center justify-between w-full mb-2">
      <span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Playing
      </span>
      <button class="text-muted-foreground hover:text-foreground transition-colors">
        <Icon name="solar:menu-dots-bold" class="w-4 h-4" />
      </button>
    </div>

    <div class="flex items-center gap-3.5">
      <div class="relative w-16 h-16 shrink-0 rounded-2xl bg-muted overflow-hidden flex items-center justify-center shadow-inner border border-border/50">
        <img 
          v-if="iconUrl" 
          :src="iconUrl" 
          :alt="game.name"
          class="w-full h-full object-cover"
        />
        <Icon v-else name="solar:gamepad-bold" class="w-8 h-8 text-muted-foreground/30" />
        
        <div class="absolute top-1 left-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-card rounded-full shadow-sm"></div>
      </div>

      <div class="flex flex-col min-w-0">
        <h4 class="font-semibold text-[15px] leading-tight text-foreground truncate">
          {{ game.name }}
        </h4>
        
        <div v-if="game.startTimestamp" class="flex items-center gap-1.5 mt-1.5 text-emerald-500 font-medium text-xs">
          <Icon name="solar:gamepad-bold" class="w-3.5 h-3.5" />
          <span class="tabular-nums tracking-tight">{{ elapsedDuration }}</span>
        </div>
        <div v-else class="text-xs text-muted-foreground mt-1 truncate">
          Currently in-game
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

const props = withDefaults(defineProps<{
  variant?: 'small' | 'large';
  game: {
    name: string;
    applicationId?: string;
    iconHash?: string;
    startTimestamp?: number; // Unix timestamp in milliseconds
  }
}>(), {
  variant: 'small'
});

// --- Compute the Discord CDN Image URL ---
const iconUrl = computed(() => {
  if (!props.game.applicationId || !props.game.iconHash) return null;
  return `https://cdn.discordapp.com/app-icons/${props.game.applicationId}/${props.game.iconHash}.png?size=128`;
});

// --- Duration Timer Logic ---
const elapsedDuration = ref('0:00');
let timerInterval: number | null = null;

const updateDuration = () => {
  if (!props.game.startTimestamp) {
    elapsedDuration.value = '';
    return;
  }
  
  const now = Date.now();
  // Ensure we don't show negative time if clocks are slightly out of sync
  const diffInSeconds = Math.max(0, Math.floor((now - props.game.startTimestamp) / 1000));
  
  const hours = Math.floor(diffInSeconds / 3600);
  const minutes = Math.floor((diffInSeconds % 3600) / 60);
  const seconds = diffInSeconds % 60;

  // Format: H:MM:SS (if over an hour) or M:SS (if under an hour)
  if (hours > 0) {
    elapsedDuration.value = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    elapsedDuration.value = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
};

// Start the timer when mounted, and clean it up when unmounted
onMounted(() => {
  if (props.game.startTimestamp) {
    updateDuration();
    // Use window.setInterval to avoid NodeJS typing conflicts in Nuxt
    timerInterval = window.setInterval(updateDuration, 1000);
  }
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

// Restart the timer if the game changes while the component is open
watch(() => props.game.startTimestamp, (newTimestamp) => {
  if (timerInterval) clearInterval(timerInterval);
  if (newTimestamp) {
    updateDuration();
    timerInterval = window.setInterval(updateDuration, 1000);
  } else {
    elapsedDuration.value = '';
  }
});
</script>
