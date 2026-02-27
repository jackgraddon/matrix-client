<template>
  <div class="matrix-voice-call h-full w-full flex flex-col relative overflow-hidden">
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
    <div class="h-20 flex items-center justify-center gap-4 px-6 shrink-0 z-20">
      <!-- Microphone Toggle -->
      <UiButton 
        :variant="voiceStore.isMicEnabled ? 'outline' : 'destructive'" 
        size="icon" 
        class="h-12 w-12 rounded-full"
        @click="voiceStore.toggleMic()"
      >
        <Icon :name="voiceStore.isMicEnabled ? 'solar:microphone-large-bold' : 'solar:microphone-large-outline'" class="h-6 w-6" />
      </UiButton>

      <!-- Camera Toggle -->
      <UiButton 
        :variant="voiceStore.isCameraEnabled ? 'outline' : 'destructive'" 
        size="icon" 
        class="h-12 w-12 rounded-full"
        @click="voiceStore.toggleCamera()"
      >
        <Icon :name="voiceStore.isCameraEnabled ? 'solar:videocamera-bold' : 'solar:videocamera-outline'" class="h-6 w-6" />
      </UiButton>

      <!-- Screen Share (Placeholder for future) -->
      <UiButton 
        variant="outline" 
        size="icon" 
        class="h-12 w-12 rounded-full"
        disabled
      >
        <Icon name="solar:screencast-outline" class="h-6 w-6" />
      </UiButton>

      <!-- Disconnect button -->
      <UiButton 
        variant="destructive" 
        size="lg" 
        class="rounded-full font-bold"
        @click="$emit('disconnect')"
      >
        <Icon name="solar:end-call-bold" />
        End Call
      </UiButton>
    </div>

    <!-- Connection Status / Background info -->
    <div class="absolute bg-neutral/80 backdrop-blur-md rounded-full top-4 left-4 z-10">
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10">
        <div class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
        <span class="text-xs font-semibold text-white uppercase tracking-wider">Live: {{ roomName }}</span>
        <span class="text-xs text-white/60 ml-2">{{ participants.length }} participants</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Room, RoomEvent, Participant } from 'livekit-client';
import { shallowRef, onMounted, onUnmounted, computed, markRaw, watch } from 'vue';
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
  if (!props.room) return;
  const all = Array.from(props.room.remoteParticipants.values());
  const newList = [props.room.localParticipant, ...all].map(p => markRaw(p));
  console.log(`[VoiceCall] Participants updated: ${newList.length} (${newList.map(p => p.identity).join(', ')})`);
  participants.value = newList;
}

// Watch for room changes to re-bind listeners
watch(() => props.room, (newRoom, oldRoom) => {
  if (oldRoom) unbindRoomListeners(oldRoom);
  if (newRoom) {
    bindRoomListeners(newRoom);
    updateParticipants();
  }
}, { immediate: true });

function bindRoomListeners(room: Room) {
  room.on(RoomEvent.SignalConnected, updateParticipants);
  room.on(RoomEvent.ParticipantConnected, updateParticipants);
  room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
  room.on(RoomEvent.TrackSubscribed, updateParticipants);
  room.on(RoomEvent.TrackUnsubscribed, updateParticipants);
  room.on(RoomEvent.TrackMuted, updateParticipants);
  room.on(RoomEvent.TrackUnmuted, updateParticipants);
  room.on(RoomEvent.ParticipantMetadataChanged, updateParticipants);
  room.on(RoomEvent.ParticipantPermissionsChanged, updateParticipants);
}

function unbindRoomListeners(room: Room) {
  room.off(RoomEvent.SignalConnected, updateParticipants);
  room.off(RoomEvent.ParticipantConnected, updateParticipants);
  room.off(RoomEvent.ParticipantDisconnected, updateParticipants);
  room.off(RoomEvent.TrackSubscribed, updateParticipants);
  room.off(RoomEvent.TrackUnsubscribed, updateParticipants);
  room.off(RoomEvent.TrackMuted, updateParticipants);
  room.off(RoomEvent.TrackUnmuted, updateParticipants);
  room.off(RoomEvent.ParticipantMetadataChanged, updateParticipants);
  room.off(RoomEvent.ParticipantPermissionsChanged, updateParticipants);
}

onUnmounted(() => {
  if (props.room) {
    unbindRoomListeners(props.room);
  }
});
</script>
