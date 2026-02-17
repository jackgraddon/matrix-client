<template>
  <div class="flex flex-col h-full">
    <!-- Room Header -->
    <header v-if="room" class="flex items-center gap-3 pb-4 border-b border-border shrink-0">
      <MatrixAvatar 
        class="h-10 w-10 border"
        :mxc-url="roomAvatarUrl"
        :name="room?.name"
        :size="96"
      />
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
    <div 
      v-else 
      ref="timelineContainer" 
      class="flex-1 overflow-y-auto space-y-1 pr-1 pb-1 min-h-0"
      @scroll="handleScroll"
    >
      <div v-if="isLoadingHistory" class="flex justify-center py-2">
         <Icon name="svg-spinners:ring-resize" class="text-muted-foreground" />
      </div>

      <div v-if="messages.length === 0 && !isLoadingHistory" class="flex items-center justify-center h-full">
        <p class="text-muted-foreground text-sm">No messages yet. Say hello!</p>
      </div>

      <template v-for="(msg, index) in messages" :key="msg.eventId">
        <!-- Date separator -->
        <div
          v-if="index === 0 || !isSameDay(msg.timestamp, messages[index - 1]?.timestamp || 0)"
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
          class="flex gap-2.5 group items-end"
          :class="msg.isOwn ? 'flex-row-reverse' : 'flex-row'"
        >
          <!-- Avatar (only shown for non-consecutive messages from same sender) -->
          <div class="w-8 shrink-0">
            <MatrixAvatar
              v-if="!isPreviousSameSender(index)"
              class="h-8 w-8 border"
              :mxc-url="msg.avatarUrl"
              :name="msg.senderName"
              :size="64"
            />
          </div>

          <!-- Message content -->
          <div class="flex flex-col max-w-[75%] min-w-0" :class="msg.isOwn ? 'items-end' : 'items-start'">
            <!-- Sender name (only for first in a group) -->
            <span
              v-if="!msg.isOwn && !isPreviousSameSender(index)"
              class="text-xs font-medium text-muted-foreground mb-1 px-1"
            >
              {{ msg.senderName }}
            </span>

            <div
              v-if="msg.type === MsgType.Image"
              class="rounded-lg overflow-hidden flex flex-col items-end"
              :class="msg.isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'"
            >
               <ChatImage 
                 :mxc-url="msg.url" 
                 :encrypted-file="msg.encryptedFile"
                 :alt="msg.body" 
                 :max-width="400"
                 class="max-w-[400px]"
                 @load="scrollToBottomIfAtBottom"
               />
               <div 
                 v-if="msg.showCaption"
                 class="rounded-2xl mt-1 px-3.5 py-2 text-sm w-fit leading-relaxed break-words whitespace-pre-wrap max-w-full"
                 style="overflow-wrap: anywhere"
                 :class="msg.isOwn
                   ? 'bg-primary text-primary-foreground rounded-br-md'
                   : 'bg-muted rounded-bl-md'"
               >
                 {{ msg.body }}
               </div>
            </div>
            
            <div
              v-else
              class="rounded-2xl mt-1 px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap max-w-full"
              style="overflow-wrap: anywhere"
              :class="msg.isOwn
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-background rounded-bl-md'"
            >
              {{ msg.body }}
            </div>
          </div>

          <!-- Timestamp (visible on hover) -->
          <span class="text-[10px] text-muted-foreground mb-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {{ formatTime(msg.timestamp) }}
          </span>
        </div>
      </template>
    </div>

    <!-- Message Composer -->
    <footer v-if="room" class="pt-4 border-t border-border shrink-0">
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
import { RoomEvent, EventType, MsgType, MatrixEventEvent, ClientEvent, type MatrixEvent, type Room, Direction, TimelineWindow, MatrixClient } from 'matrix-js-sdk';
import ChatImage from '~/components/ChatImage.vue';

const props = defineProps<{
  isDm?: boolean;
}>();

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
  type: string;
  url?: string;
  encryptedFile?: any;
  filename?: string;
  showCaption?: boolean;
}

const messages = ref<ChatMessage[]>([]);
const newMessage = ref('');
const isSending = ref(false);
const isLoadingHistory = ref(false);
const room = ref<Room | null>(null);
const timelineContainer = ref<HTMLElement | null>(null);
const timelineWindow = ref<TimelineWindow | null>(null); // Store the TimelineWindow instance

// --- Computed ---

const roomId = computed(() => {
  const params = route.params.id;
  // Catch-all route gives an array of path segments; join them back with '/'
  return Array.isArray(params) ? params.join('/') : params;
});

const roomAvatarUrl = computed(() => {
  if (!room.value || !store.client) return null;
  const mxc = room.value.getMxcAvatarUrl();
  if (mxc) return mxc;

  if (props.isDm) {
    // Fallback: find the other member in this DM
    const myUserId = store.client.getUserId();
    // Use current state members to be safe, though getJoinedMembers is usually fine
    const members = room.value.getJoinedMembers();
    const otherMember = members.find(m => m.userId !== myUserId);
    
    return otherMember?.getMxcAvatarUrl() || null;
  }
  
  return null;
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
  const type = event.getType();
  const isEncrypted = type === 'm.room.encrypted';
  
  if (type !== EventType.RoomMessage && !isEncrypted) return null;

  const content = isEncrypted ? event.getClearContent() : event.getContent();
  
  if (!content || !content.body) return null; // Pending decryption or invalid

  const senderId = event.getSender() || '';
  const senderMember = room.value?.getMember(senderId);
  const senderName = senderMember?.name || senderId;

  let avatarUrl: string | null = null;
  const mxcAvatar = senderMember?.getMxcAvatarUrl();
  if (mxcAvatar && store.client) {
    avatarUrl = mxcAvatar;
  }

  // extract filename if available
  // content.filename is common, or content.file?.name (for encrypted)
  let filename = content.filename;
  if (!filename && content.file && content.file.name) {
      filename = content.file.name;
  }
  
  // Determine if caption should be shown
  let showCaption = !!content.body;
  
  // If we have a filename, don't show if simple match
  if (filename && content.body === filename) {
    showCaption = false;
  }
  
  // Heuristic: If we don't have a filename (or even if we do), 
  // if the body looks looks like a strict filename (extension, no spaces), hide it.
  // This covers cases where filename metadata is missing but body is "IMG_1234.JPG"
  const isLikelyFilename = /\.(png|jpe?g|gif|webp)$/i.test(content.body) && !/\s/.test(content.body);
  if (!filename && isLikelyFilename) {
    showCaption = false;
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
    type: content.msgtype || MsgType.Text,
    url: content.url,
    encryptedFile: content.file,
    filename,
    showCaption
  };
}

function updateOrPushEvent(event: MatrixEvent) {
  const mapped = mapEvent(event);
  if (!mapped) return;

  const idx = messages.value.findIndex(m => m.eventId === mapped.eventId);
  if (idx !== -1) {
    messages.value[idx] = mapped;
  } else {
    messages.value.push(mapped);
    if (mapped.isOwn) {
        forceScrollToBottom();
    } else {
        scrollToBottomIfAtBottom();
    }
  }
}

function handleDecryption(event: MatrixEvent) {
   // When decrypted, try to map and update
   updateOrPushEvent(event);
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

function forceScrollToBottom() {
  nextTick(() => {
    const el = timelineContainer.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function scrollToBottomIfAtBottom() {
  const el = timelineContainer.value;
  if (!el) return;
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 100;
  if (isAtBottom) {
    forceScrollToBottom();
  }
}

function sendReadReceipt(event: MatrixEvent) {
  if (!room.value || !store.client) return;
  store.client.sendReadReceipt(event);
}

// --- Pagination (TimelineWindow) ---

function handleScroll(e: Event) {
  const target = e.target as HTMLElement;
  // If close to top (e.g. within 50px)
  if (target.scrollTop < 50 && !isLoadingHistory.value) {
    loadMoreMessages();
  }
}

async function loadMoreMessages() {
  if (!timelineWindow.value || isLoadingHistory.value) return;
  
  // Check if we can paginate back
  if (!timelineWindow.value.canPaginate(Direction.Backward)) {
    // No more history to load
    return;
  }

  isLoadingHistory.value = true;
  
  // Capture current height to restore position
  const el = timelineContainer.value;
  const oldHeight = el ? el.scrollHeight : 0;
  const oldScrollTop = el ? el.scrollTop : 0;

  try {
    await timelineWindow.value.paginate(Direction.Backward, 20);
    
    // Update messages from window
    updateMessagesFromWindow(true, oldHeight, oldScrollTop);
  } catch (err) {
    console.error('Failed to load history:', err);
  } finally {
    isLoadingHistory.value = false;
  }
}

function updateMessagesFromWindow(preserveScroll = false, oldHeight = 0, oldScrollTop = 0) {
  if (!timelineWindow.value) return;
  
  const events = timelineWindow.value.getEvents();
  messages.value = [];

  for (const event of events) {
    if (event.isEncrypted() && !event.getClearContent()) {
       event.once(MatrixEventEvent.Decrypted, () => handleDecryption(event));
    }
    const mapped = mapEvent(event);
    if (mapped) {
      messages.value.push(mapped);
    }
  }

  if (preserveScroll) {
    nextTick(() => {
      const el = timelineContainer.value;
      if (el) {
        // The new content height minus the old content height gives us the amount of new content added to the top.
        // We want to be at the same visual position, so we add that difference to the scroll top.
        el.scrollTop = el.scrollHeight - oldHeight + oldScrollTop;
        
        // Even when preserving scroll, we might not have enough content if we started small and paged back a bit?
        // But usually paginate(Back) adds content. 
        // We only really strictly need fillViewport on initial load or if we are at the bottom and it's sparse.
        // But adding it here generally doesn't hurt if we are careful.
        // If we are preserving scroll, we are likely paging back.
        // If we page back and it's STILL not scrollable? Then we should load more.
        fillViewport(); 
      }
    });
  } else {
    forceScrollToBottom();
    fillViewport();
  }
}

// --- Live message handler ---

function onTimelineEvent(event: MatrixEvent, eventRoom: Room | undefined, toStartOfTimeline: boolean | undefined) {
  if (toStartOfTimeline) return; // Handled by pagination
  if (!eventRoom || eventRoom.roomId !== roomId.value) return;

  if (event.isEncrypted() && !event.getClearContent()) {
    event.once(MatrixEventEvent.Decrypted, () => handleDecryption(event));
  }
  
  // Update window to include this live event
  if (timelineWindow.value && timelineWindow.value.canPaginate(Direction.Forward)) {
     timelineWindow.value.paginate(Direction.Forward, 1);
  }
  
  // Just push new live events to the list
  updateOrPushEvent(event);
  
  // Mark as read if we are looking at the room
  // Optimization: Debounce this or check document visibility in production, 
  // but for now, if the component is active, we assume user is reading.
  sendReadReceipt(event);
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

async function initRoom() {
  if (!store.client) return;
  const r = store.client.getRoom(roomId.value);
  if (!r) {
    // Room not found yet (syncing?)
    // Set up a one-time listener for when a room is added
    if (!store.client.listeners(ClientEvent.Room).includes(onRoomAdded)) {
        store.client.on(ClientEvent.Room, onRoomAdded);
    }
    room.value = null;
    return;
  }
  
  // Found room, clean up temp listener
  store.client.removeListener(ClientEvent.Room, onRoomAdded);
  room.value = r;

  // Initialize TimelineWindow
  const timelineSet = r.getLiveTimeline().getTimelineSet();
  timelineWindow.value = new TimelineWindow(store.client as MatrixClient, timelineSet);
  
  try {
    // Load initial window (latest messages)
    await timelineWindow.value.load(undefined, 30); // Load initial 30
    updateMessagesFromWindow(false);
  } catch (e) {
    console.error("Failed to load timeline window", e);
  }
  
  // Mark last message as read on entry
  const timeline = r.getLiveTimeline();
  const events = timeline.getEvents();
  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    if (lastEvent) {
        sendReadReceipt(lastEvent);
    }
  }
}

async function fillViewport() {
  await nextTick();
  const el = timelineContainer.value;
  if (!el || !timelineWindow.value || isLoadingHistory.value) return;
  
  // If content is smaller than container and we have more history
  if (el.scrollHeight <= el.clientHeight && timelineWindow.value.canPaginate(Direction.Backward)) {
    await loadMoreMessages();
  }
}

function onRoomAdded(room: Room) {
    if (room.roomId === roomId.value) {
        initRoom();
    }
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
  store.client?.removeListener(ClientEvent.Room, onRoomAdded);
});
</script>

<style scoped>
/* Hide scrollbar but keep scroll functionality */
.overflow-y-auto {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}
</style>
