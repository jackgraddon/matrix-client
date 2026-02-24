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
        :variant="isMicEnabled ? 'secondary' : 'destructive'" 
        size="icon" 
        class="h-12 w-12 rounded-full"
        @click="toggleMic"
      >
        <Icon :name="isMicEnabled ? 'solar:microphone-bold' : 'solar:microphone-slash-bold'" class="h-6 w-6" />
      </UiButton>

      <!-- Camera Toggle -->
      <UiButton 
        :variant="isCameraEnabled ? 'secondary' : 'destructive'" 
        size="icon" 
        class="h-12 w-12 rounded-full"
        @click="toggleCamera"
      >
        <Icon :name="isCameraEnabled ? 'solar:videocamera-record-bold' : 'solar:videocamera-record-stop-bold'" class="h-6 w-6" />
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
import { ref, onMounted, onUnmounted, computed } from 'vue';
import ParticipantTile from './ParticipantTile.vue';

const props = defineProps<{
  room: Room;
  roomId: string;
  roomName: string;
}>();

const emit = defineEmits<{
  (e: 'disconnect'): void;
}>();

const participants = ref<Participant[]>([]);
const isMicEnabled = ref(props.room.localParticipant.isMicrophoneEnabled);
const isCameraEnabled = ref(props.room.localParticipant.isCameraEnabled);

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
  participants.value = [props.room.localParticipant, ...all];
}

async function toggleMic() {
  const enabled = !isMicEnabled.value;
  await props.room.localParticipant.setMicrophoneEnabled(enabled);
  isMicEnabled.value = enabled;
}

async function toggleCamera() {
  const enabled = !isCameraEnabled.value;
  await props.room.localParticipant.setCameraEnabled(enabled);
  isCameraEnabled.value = enabled;
}

// Event Listeners
const onParticipantConnected = () => updateParticipants();
const onParticipantDisconnected = () => updateParticipants();
const onMetadataChanged = () => updateParticipants();

onMounted(() => {
  updateParticipants();
  props.room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
  props.room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
  props.room.on(RoomEvent.ParticipantMetadataChanged, onMetadataChanged);
  props.room.on(RoomEvent.LocalTrackPublished, () => {
      isMicEnabled.value = props.room.localParticipant.isMicrophoneEnabled;
      isCameraEnabled.value = props.room.localParticipant.isCameraEnabled;
  });
});

onUnmounted(() => {
  props.room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
  props.room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
  props.room.off(RoomEvent.ParticipantMetadataChanged, onMetadataChanged);
});
</script>
