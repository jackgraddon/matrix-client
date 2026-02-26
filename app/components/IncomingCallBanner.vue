<template>
  <div v-if="isCallIncoming" class="bg-green-500/10 border border-green-500/50 p-3 rounded-lg flex items-center justify-between mb-4 animate-in fade-in slide-in-from-top duration-300">
    <div class="flex items-center gap-3">
      <div class="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center animate-pulse shrink-0">
        <Icon name="solar:phone-calling-bold" class="text-white h-5 w-5" />
      </div>
      <div class="min-w-0">
        <h4 class="font-bold text-sm text-green-600 dark:text-green-500">Incoming Call...</h4>
        <p class="text-xs text-muted-foreground truncate">{{ roomName }} started a voice call.</p>
      </div>
    </div>
    
    <div class="flex gap-2 shrink-0">
      <UiButton size="sm" variant="default" class="bg-green-600 hover:bg-green-700 text-white" @click="answerCall">
        Join Call
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMatrixStore } from '~/stores/matrix';

const props = defineProps<{
  roomId: string;
  roomName: string;
}>();

const store = useMatrixStore();

const isCallIncoming = computed(() => {
  const participants = store.getVoiceParticipants(props.roomId);
  const amIInCall = participants.some(p => p.id === store.client?.getUserId());
  
  // If there are people in the call, but we aren't one of them, it's ringing!
  // And we should only show it if we're not currently in ANOTHER call (or maybe even if we are, but let's keep it simple)
  return participants.length > 0 && !amIInCall && !store.activeVoiceCall;
});

const answerCall = () => {
  store.joinVoiceChannel(props.roomId);
};
</script>
