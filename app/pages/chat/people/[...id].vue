<template>
  <div class="flex flex-col h-full">
    <!-- Room Header -->
    <header v-if="room" class="flex items-center gap-3 pb-4 border-b border-border mb-4 shrink-0">
      <UiAvatar class="h-10 w-10 border">
        <UiAvatarImage v-if="roomAvatarUrl" :src="roomAvatarUrl" :alt="room.name" class="object-cover" />
        <UiAvatarFallback>{{ roomInitials }}</UiAvatarFallback>
      </UiAvatar>
      <div class="flex flex-col min-w-0">
        <h1 class="text-lg font-semibold leading-tight truncate">{{ room.name }}</h1>
        <p v-if="roomTopic" class="text-xs text-muted-foreground truncate">{{ roomTopic }}</p>
      </div>
    </header>

    <!-- Loading state -->
    <div v-if="!room" class="flex-1 flex items-center justify-center">
      <p class="text-muted-foreground">Loading room...</p>
    </div>

    <!-- Message Timeline -->
    <div v-else ref="timelineContainer" class="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
      <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
        <p class="text-muted-foreground text-sm">No messages yet. Say hello!</p>
      </div>

      <template v-for="(msg, index) in messages" :key="msg.eventId">
        <!-- Date separator -->
        <div
          v-if="index === 0 || !isSameDay(msg.timestamp, messages[index - 1].timestamp)"
          class="flex items-center gap-3 py-3"
        >
          <div class="flex-1 h-px bg-border" />
          <span class="text-xs text-muted-foreground font-medium shrink-0">
            {{ formatDate(msg.timestamp) }}
          </span>
          <div class="flex-1 h-px bg-border" />
        </div>

        <!-- Message bubble -->
        <div
          class="flex gap-2.5 group"
          :class="msg.isOwn ? 'flex-row-reverse' : 'flex-row'"
        >
          <!-- Avatar (only shown for non-consecutive messages from same sender) -->
          <div class="w-8 shrink-0">
            <UiAvatar
              v-if="!isPreviousSameSender(index)"
              class="h-8 w-8 border"
            >
              <UiAvatarImage
                v-if="msg.avatarUrl"
                :src="msg.avatarUrl"
                :alt="msg.senderName"
                class="object-cover"
              />
              <UiAvatarFallback class="text-xs">{{ msg.senderInitials }}</UiAvatarFallback>
            </UiAvatar>
          </div>

          <!-- Message content -->
          <div class="flex flex-col max-w-[75%]" :class="msg.isOwn ? 'items-end' : 'items-start'">
            <!-- Sender name (only for first in a group) -->
            <span
              v-if="!msg.isOwn && !isPreviousSameSender(index)"
              class="text-xs font-medium text-muted-foreground mb-1 px-1"
            >
              {{ msg.senderName }}
            </span>

            <div
              class="rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words"
              :class="msg.isOwn
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted rounded-bl-md'"
            >
              {{ msg.body }}
            </div>

            <!-- Timestamp (visible on hover) -->
            <span class="text-[10px] text-muted-foreground mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {{ formatTime(msg.timestamp) }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- Message Composer -->
    <footer v-if="room" class="pt-4 border-t border-border mt-2 shrink-0">
      <form @submit.prevent="sendMessage" class="flex items-center gap-2">
        <UiInput
          v-model="newMessage"
          placeholder="Write a message..."
          class="flex-1"
          :disabled="isSending"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <UiButton type="submit" :disabled="!canSend" size="default">
          <Icon name="solar:plain-bold" class="h-4 w-4" />
        </UiButton>
      </form>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { RoomEvent, EventType, MsgType, type MatrixEvent, type Room } from 'matrix-js-sdk';

const route = useRoute();
const store = useMatrixStore();

// --- Reactive state ---

interface ChatMessage {
  eventId: string;
  senderId: string;
  senderName: string;
  senderInitials: string;
  avatarUrl: string | null;
  body: string;
  timestamp: number;
  isOwn: boolean;
}

const messages = ref<ChatMessage[]>([]);
const newMessage = ref('');
const isSending = ref(false);
const room = ref<Room | null>(null);
const timelineContainer = ref<HTMLElement | null>(null);

// --- Computed ---

const roomId = computed(() => {
  const params = route.params.id;
  // Catch-all route gives an array of path segments; join them back with '/'
  return Array.isArray(params) ? params.join('/') : params;
});

const roomAvatarUrl = computed(() => {
  if (!room.value || !store.client) return null;
  const mxcUrl = room.value.getMxcAvatarUrl();
  return mxcUrl ? store.client.mxcUrlToHttp(mxcUrl, 80, 80, 'crop') : null;
});

const roomInitials = computed(() => {
  const name = room.value?.name || '?';
  return name.slice(0, 2).toUpperCase();
});

const roomTopic = computed(() => {
  if (!room.value) return '';
  const topicEvent = room.value.currentState.getStateEvents('m.room.topic', '');
  return topicEvent?.getContent()?.topic || '';
});

const canSend = computed(() => newMessage.value.trim().length > 0 && !isSending.value);

// --- Helpers ---

function mapEvent(event: MatrixEvent): ChatMessage | null {
  if (event.getType() !== EventType.RoomMessage) return null;
  const content = event.getContent();
  if (!content.body) return null;

  const senderId = event.getSender() || '';
  const senderMember = room.value?.getMember(senderId);
  const senderName = senderMember?.name || senderId;

  let avatarUrl: string | null = null;
  const mxcAvatar = senderMember?.getMxcAvatarUrl();
  if (mxcAvatar && store.client) {
    avatarUrl = store.client.mxcUrlToHttp(mxcAvatar, 64, 64, 'crop');
  }

  return {
    eventId: event.getId() || '',
    senderId,
    senderName,
    senderInitials: senderName.replace(/^[@!]/, '').slice(0, 2).toUpperCase(),
    avatarUrl,
    body: content.body,
    timestamp: event.getTs(),
    isOwn: senderId === store.client?.getUserId(),
  };
}

function loadTimeline() {
  if (!room.value) return;
  const events = room.value.getLiveTimeline().getEvents();
  messages.value = events
    .map(mapEvent)
    .filter((m): m is ChatMessage => m !== null);
  scrollToBottom();
}

function isPreviousSameSender(index: number): boolean {
  if (index === 0) return false;
  const current = messages.value[index];
  const previous = messages.value[index - 1];
  if (!current || !previous) return false;
  return current.senderId === previous.senderId
    && isSameDay(current.timestamp, previous.timestamp);
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (isSameDay(ts, now.getTime())) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(ts, yesterday.getTime())) return 'Yesterday';

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function scrollToBottom() {
  nextTick(() => {
    const el = timelineContainer.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// --- Live message handler ---

function onTimelineEvent(event: MatrixEvent, eventRoom: Room | undefined, toStartOfTimeline: boolean | undefined) {
  if (toStartOfTimeline) return; // Ignore back-pagination
  if (!eventRoom || eventRoom.roomId !== roomId.value) return;

  const mapped = mapEvent(event);
  if (mapped) {
    messages.value.push(mapped);
    scrollToBottom();
  }
}

// --- Send message ---

async function sendMessage() {
  if (!canSend.value || !store.client) return;
  const text = newMessage.value.trim();
  newMessage.value = '';
  isSending.value = true;

  try {
    await store.client.sendEvent(roomId.value!, EventType.RoomMessage, {
      body: text,
      msgtype: MsgType.Text,
    });
  } catch (err) {
    console.error('Failed to send message:', err);
    // Restore message on failure so the user doesn't lose it
    newMessage.value = text;
  } finally {
    isSending.value = false;
  }
}

// --- Lifecycle ---

function initRoom() {
  if (!store.client) return;
  const r = store.client.getRoom(roomId.value);
  if (!r) {
    console.warn('Room not found:', roomId.value);
    room.value = null;
    return;
  }
  room.value = r;
  loadTimeline();
}

function setupListener() {
  store.client?.on(RoomEvent.Timeline, onTimelineEvent);
}

function teardownListener() {
  store.client?.removeListener(RoomEvent.Timeline, onTimelineEvent);
}

onMounted(() => {
  if (store.client) {
    initRoom();
    setupListener();
  }
});

// Re-init when room changes (sidebar navigation)
watch(roomId, () => {
  if (store.client) {
    initRoom();
  }
});

// Handle late client init (e.g. page refresh)
watch(
  () => store.client,
  (newClient) => {
    if (newClient) {
      initRoom();
      setupListener();
    }
  }
);

onUnmounted(() => {
  teardownListener();
});
</script>

<style scoped>
/* Hide scrollbar but keep scroll functionality */
.overflow-y-auto {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}
</style>