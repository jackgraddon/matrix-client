<template>
  <div class="participant-tile relative flex flex-col items-center justify-center bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700 shadow-xl group aspect-video">
    <!-- Video Track -->
    <video
      v-if="videoTrack"
      ref="videoElement"
      autoplay
      playsinline
      class="w-full h-full object-cover"
    ></video>

    <!-- Avatar Fallback (Visible if no video or video is off) -->
    <div 
      v-if="!videoTrack || !isCameraEnabled"
      class="absolute inset-0 flex flex-col items-center justify-center bg-neutral-800 gap-4"
    >
      <MatrixAvatar 
        :mxc-url="avatarUrl" 
        :name="displayName" 
        class="w-24 h-24 rounded-full border-2 border-primary/20 shadow-2xl" 
        :size="128"
      />
      <div class="flex flex-col items-center gap-1">
        <span class="text-xl font-bold text-white drop-shadow-md">{{ displayName }}</span>
        <span v-if="isSpeaking" class="text-xs font-bold text-green-500 uppercase tracking-widest animate-pulse">Speaking...</span>
      </div>
    </div>

    <!-- Overlay Controls (Bottom) -->
    <div class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-white px-2 py-0.5 bg-black/40 rounded backdrop-blur-sm">
          {{ displayName }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <Icon v-if="!isMicEnabled" name="solar:muted-bold" class="h-4 w-4 text-red-500" />
        <Icon v-if="isSpeaking" name="solar:soundwave-bold" class="h-4 w-4 text-green-500" />
      </div>
    </div>

    <!-- Speaking Border -->
    <div 
      v-if="isSpeaking" 
      class="absolute inset-0 border-2 border-green-500 rounded-lg pointer-events-none z-10 animate-pulse"
    ></div>

    <!-- Hidden audio element for this participant -->
    <audio ref="audioElement" autoplay></audio>
  </div>
</template>

<script setup lang="ts">
import { Participant, Track, RemoteTrack, TrackPublication, RemoteTrackPublication } from 'livekit-client';
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useMatrixStore } from '~/stores/matrix';
import MatrixAvatar from '~/components/MatrixAvatar.vue';

const props = defineProps<{
  participant: Participant;
  roomId: string;
}>();

const store = useMatrixStore();
const videoElement = ref<HTMLVideoElement | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);

const videoTrack = ref<RemoteTrack | Track | null>(null);
const audioTrack = ref<RemoteTrack | Track | null>(null);

const isSpeaking = ref(props.participant.isSpeaking);
const isMicEnabled = ref(props.participant.isMicrophoneEnabled);
const isCameraEnabled = ref(props.participant.isCameraEnabled);

// Matrix Data extraction
const roomMember = computed(() => {
  if (!store.client) return null;
  const room = store.client.getRoom(props.roomId);
  return room?.getMember(props.participant.identity);
});

const displayName = computed(() => roomMember.value?.name || props.participant.identity?.split(':')?.[0]?.replace('@', '') || 'Guest');
const avatarUrl = computed(() => roomMember.value?.getMxcAvatarUrl() || null);

function handleTrackSubscribed(track: any) {
  if (track.kind === Track.Kind.Video) {
    videoTrack.value = track;
    if (videoElement.value) track.attach(videoElement.value);
  } else if (track.kind === Track.Kind.Audio) {
    audioTrack.value = track;
    if (audioElement.value) track.attach(audioElement.value);
  }
}

function handleTrackUnsubscribed(track: any) {
  track.detach();
  if (track.kind === Track.Kind.Video) {
    videoTrack.value = null;
  } else if (track.kind === Track.Kind.Audio) {
    audioTrack.value = null;
  }
}

// Initial tracks
props.participant.on('trackSubscribed', handleTrackSubscribed);
props.participant.on('trackUnsubscribed', handleTrackUnsubscribed);
props.participant.on('isSpeakingChanged', (speaking: boolean) => {
  isSpeaking.value = speaking;
});
props.participant.on('trackPublished', (pub: TrackPublication) => {
  updateMediaState();
});
props.participant.on('trackUnpublished', (pub: TrackPublication) => {
  updateMediaState();
});

function updateMediaState() {
  isMicEnabled.value = props.participant.isMicrophoneEnabled;
  isCameraEnabled.value = props.participant.isCameraEnabled;
}

// Watch for manual attaches if tracks already existed
onMounted(() => {
  props.participant.trackPublications.forEach((pub: any) => {
    if (pub.track) handleTrackSubscribed(pub.track);
  });
  updateMediaState();
});

onUnmounted(() => {
  props.participant.off('trackSubscribed', handleTrackSubscribed);
  props.participant.off('trackUnsubscribed', handleTrackUnsubscribed);
  if (videoTrack.value) videoTrack.value.detach();
  if (audioTrack.value) audioTrack.value.detach();
});
</script>
