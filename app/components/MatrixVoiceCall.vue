<template>
  <div class="matrix-voice-call h-full w-full bg-neutral-900 flex flex-col relative overflow-hidden">
    <!-- Main Call Grid -->
    <div 
      class="flex-1 p-6 grid gap-4 auto-rows-fr"
      :style="{
        gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`
      }"
    >
      <ParticipantTile 
        v-for="p in (participants as any[])" 
        :key="p.identity" 
        :participant="p" 
        :room-id="roomId"
      />
    </div>

    <!-- Call Controls Bar -->
    <div class="h-20 bg-neutral-950/80 backdrop-blur-md border-t border-neutral-800 flex items-center justify-center gap-4 px-6 shrink-0 z-20">
      <!-- Microphone Toggle -->
      <UiButton 
        :variant="voiceStore.isMicEnabled ? 'secondary' : 'destructive'" 
        size="icon" 
        class="h-12 w-12 rounded-full"
        @click="voiceStore.toggleMic()"
      >
        <Icon :name="voiceStore.isMicEnabled ? 'solar:microphone-bold' : 'solar:microphone-slash-bold'" class="h-6 w-6" />
      </UiButton>

      <!-- Camera Toggle -->
      <UiButton 
        :variant="voiceStore.isCameraEnabled ? 'secondary' : 'destructive'" 
        size="icon" 
        class="h-12 w-12 rounded-full"
        @click="voiceStore.toggleCamera()"
      >
        <Icon :name="voiceStore.isCameraEnabled ? 'solar:videocamera-record-bold' : 'solar:videocamera-record-stop-bold'" class="h-6 w-6" />
      </UiButton>

      <!-- Screen Share (Placeholder for future) -->
      <UiButton 
        variant="ghost" 
        size="icon" 
        class="h-12 w-12 rounded-full text-neutral-400 hover:text-white"
        disabled
      >
        <Icon name="solar:screen-share-bold" class="h-6 w-6" />
      </UiButton>

      <div class="w-px h-8 bg-neutral-800 mx-2"></div>

      <!-- Disconnect button -->
      <UiButton 
        variant="destructive" 
        size="lg" 
        class="rounded-full px-8 gap-2 font-bold"
        @click="$emit('disconnect')"
      >
        <Icon name="solar:phone-calling-broken-bold" class="h-5 w-5" />
        End Call
      </UiButton>
    </div>

    <!-- Connection Status / Background info -->
    <div class="absolute top-4 left-4 z-10">
      <div class="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
        <div class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
        <span class="text-xs font-semibold text-white uppercase tracking-wider">Live: {{ roomName }}</span>
        <span class="text-xs text-white/60 ml-2">{{ participants.length }} participants</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Room, RoomEvent, Participant } from 'livekit-client';
import { shallowRef, onMounted, onUnmounted, computed, markRaw } from 'vue';
import ParticipantTile from './ParticipantTile.vue';
import { useVoiceStore } from '~/stores/voice';

const props = defineProps<{
  room: Room;
  roomId: string;
  roomName: string;
}>();

const emit = defineEmits<{
  (e: 'disconnect'): void;
}>();

const voiceStore = useVoiceStore();
const participants = shallowRef<Participant[]>([]);

// Grid logic
const gridColumns = computed(() => {
  const count = participants.value.length;
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
});

function updateParticipants() {
  const all = Array.from(props.room.remoteParticipants.values());
  const newList = [props.room.localParticipant, ...all].map(p => markRaw(p));
  console.log(`[VoiceCall] Participants updated: ${newList.length} (${newList.map(p => p.identity).join(', ')})`);
  participants.value = newList;
}

onMounted(() => {
  updateParticipants();
  
  props.room.on(RoomEvent.SignalConnected, () => {
    console.log('[VoiceCall] Signal connected — refreshing participants');
    updateParticipants();
  });

  props.room.on(RoomEvent.ParticipantConnected, updateParticipants);
  props.room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
  props.room.on(RoomEvent.TrackSubscribed, updateParticipants);
  props.room.on(RoomEvent.TrackUnsubscribed, updateParticipants);
  props.room.on(RoomEvent.TrackMuted, updateParticipants);
  props.room.on(RoomEvent.TrackUnmuted, updateParticipants);
  props.room.on(RoomEvent.ParticipantMetadataChanged, updateParticipants);
  props.room.on(RoomEvent.ParticipantPermissionsChanged, updateParticipants);
});

onUnmounted(() => {
  props.room.off(RoomEvent.ParticipantConnected, updateParticipants);
  props.room.off(RoomEvent.ParticipantDisconnected, updateParticipants);
  props.room.off(RoomEvent.TrackSubscribed, updateParticipants);
  props.room.off(RoomEvent.TrackUnsubscribed, updateParticipants);
  props.room.off(RoomEvent.TrackMuted, updateParticipants);
  props.room.off(RoomEvent.TrackUnmuted, updateParticipants);
  props.room.off(RoomEvent.ParticipantMetadataChanged, updateParticipants);
  props.room.off(RoomEvent.ParticipantPermissionsChanged, updateParticipants);
});
</script>
