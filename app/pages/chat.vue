<template>
    <div class="flex flex-col h-screen overflow-hidden">
        <header class="h-16 flex items-center px-4 gap-2 justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
                <Icon name="solar:chat-round-dots-bold" class="h-5 w-5" />
                Ruby Chat
            </h2>
            <div class="flex items-center gap-2">
                <ColorModeToggle />
            </div>
        </header>
        <UiResizablePanelGroup class="flex-1" direction="horizontal">
            <!-- Sidebar -->
            <UiResizablePanel :min-size="15" :default-size="25" :max-size="30">
                <aside class="flex h-full flex-col">
                    <nav class="grow flex-1 flex flex-row p-2 gap-2 overflow-y-auto">
                        <div class="flex flex-col gap-2 flex-0">
                            <UiButton
                                v-for="link in links"
                                :key="link.name"
                                :disabled="isLinkActive(link.to)"
                                :variant="isLinkActive(link.to) ? 'secondary' : 'ghost'"
                                as-child
                            >
                                <NuxtLink :to="link.to" :aria-label="link.name">
                                    <Icon
                                        :name="isLinkActive(link.to) ? `${link.icon}-bold` : `${link.icon}-linear`"
                                        class="h-4 w-4"
                                    />
                                    <!-- {{ link.name }} -->
                                </NuxtLink>
                            </UiButton>
                        </div>
                        <div class="flex flex-col gap-2 flex-1">
                            <!-- Sidebar DM List -->
                            <UiButton 
                                v-if="isLinkActive('/chat/people')"
                                v-for="friend in friends"
                                :key="friend.roomId"
                                :disabled="isLinkActive(`/chat/people/${friend.roomId}`)"
                                :variant="isLinkActive(`/chat/people/${friend.roomId}`) ? 'secondary' : 'ghost'"
                                class="justify-start"
                                as-child
                            >
                                <NuxtLink :to="`/chat/people/${friend.roomId}`">
                                    <MatrixAvatar
                                        :mxc-url="friend.avatarUrl"
                                        :name="friend.name"
                                        class="h-6 w-6 mr-1"
                                        :size="64"
                                    />
                                    {{ friend.name }}
                                    <div v-if="friend.unreadCount > 0" class="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                        {{ friend.unreadCount }}
                                    </div>
                                </NuxtLink>
                            </UiButton>
                            <!-- Sidebar Room List -->
                            <UiButton 
                                v-if="isLinkActive('/chat/rooms')"
                                v-for="room in rooms"
                                :key="room.roomId"
                                :disabled="isLinkActive(`/chat/rooms/${room.roomId}`)"
                                :variant="isLinkActive(`/chat/rooms/${room.roomId}`) ? 'secondary' : 'ghost'"
                                class="justify-start"
                                as-child
                            >
                                <NuxtLink :to="`/chat/rooms/${room.roomId}`">
                                    <MatrixAvatar
                                        :mxc-url="room.avatarUrl"
                                        :name="room.name"
                                        class="h-6 w-6 mr-1"
                                        :size="64"
                                    />
                                    {{ room.name }}
                                    <div v-if="room.unreadCount > 0" class="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                        {{ room.unreadCount }}
                                    </div>
                                </NuxtLink>
                            </UiButton>
                        </div>
                    </nav>
                    <footer class="p-2">
                        <UiButton variant="ghost" as-child>
                            <div class="p-4 h-fit w-full flex justify-start cursor-pointer" @click="navigateTo('/chat/settings')">
                                <UserProfile />
                            </div>
                        </UiButton>
                    </footer>
                </aside>
            </UiResizablePanel>
            <UiResizableHandle class="bg-transparent" />
            <!-- Main Content -->
            <UiResizablePanel :min-size="70" :default-size="75" :max-size="85">
            <main class="flex h-full max-w-full flex-col">
                <div class="overflow-auto mb-2 mr-2 p-5 rounded-lg h-full bg-neutral-100 dark:bg-neutral-900">
                    <NuxtPage />
                </div>
            </main>
            </UiResizablePanel>
        </UiResizablePanelGroup>
    </div>
    <VerificationWarning />
    <VerificationModal />
</template>

<script setup lang="ts">
definePageMeta({
    middleware: "auth",
});

import { Room, ClientEvent, RoomEvent, EventType, NotificationCountType, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { PushProcessor } from 'matrix-js-sdk/lib/pushprocessor';
const route = useRoute();

const links = [
    { name: "Home", to: "/chat", icon: "solar:home-angle" },
    { name: "People", to: "/chat/people", icon: "solar:users-group-rounded" },
    { name: "Rooms", to: "/chat/rooms", icon: "solar:inbox-archive" },
];

const store = useMatrixStore();
import MatrixAvatar from '~/components/MatrixAvatar.vue';

// Reactive state for the UI
interface MappedRoom {
  roomId: string;
  name: string;
  lastMessage: string;
  lastActive: number;
  avatarUrl?: string | null;
  unreadCount: number;
}

const friends = ref<(MappedRoom & { dmUserId: string })[]>([]);
const rooms = ref<MappedRoom[]>([]);

// Helper to format rooms for display, split by type
const updateRooms = () => {
  if (!store.client) return;
  
  // Get all joined rooms
  const matrixRooms = store.client.getVisibleRooms();

  // Build a set of DM room IDs from m.direct account data
  const directEvent = store.client.getAccountData(EventType.Direct);
  const directContent: Record<string, string[]> = directEvent ? directEvent.getContent() as Record<string, string[]> : {};
  const dmRoomIds = new Set<string>();
  for (const roomIds of Object.values(directContent)) {
    for (const id of roomIds) dmRoomIds.add(id);
  }

  const dmList: (MappedRoom & { dmUserId: string })[] = [];
  const roomList: MappedRoom[] = [];

  for (const room of matrixRooms) {
    // Skip spaces — they aren't chat rooms
    if (room.isSpaceRoom()) continue;

    // Attempt to get the last message event for the preview text
    const lastEvent = room.timeline.length > 0 
      ? room.timeline[room.timeline.length - 1] 
      : null;

    const mapped: MappedRoom = {
      roomId: room.roomId,
      name: room.name || 'Unnamed Room',
      lastMessage: lastEvent ? lastEvent.getContent().body : 'No messages',
      lastActive: room.getLastActiveTimestamp() ?? 0,
      avatarUrl: room.getMxcAvatarUrl(),
      unreadCount: room.getUnreadNotificationCount(NotificationCountType.Total) ?? 0,
    };

    if (dmRoomIds.has(room.roomId)) {
      // Find which user this DM is with
      const dmUserId = Object.entries(directContent)
        .find(([, ids]) => ids.includes(room.roomId))?.[0] ?? '';
      
      // Try to get the specific user's avatar for DMs
      let avatarUrl = mapped.avatarUrl;
      const user = store.client.getUser(dmUserId);
      if (user?.avatarUrl) {
          avatarUrl = user.avatarUrl;
      }

      dmList.push({ ...mapped, dmUserId, avatarUrl });
    } else {
      roomList.push(mapped);
    }
  }

  // Sort both lists newest-first
  dmList.sort((a, b) => b.lastActive - a.lastActive);
  roomList.sort((a, b) => b.lastActive - a.lastActive);

  // Update the reactive state
  friends.value = dmList;
  rooms.value = roomList;
};

// Hook up listeners so the UI updates when messages come in
const handleTimelineEvent = (event: MatrixEvent, room: Room | undefined, toStartOfTimeline: boolean | undefined) => {
  // Update the room list UI
  updateRooms();

  if (toStartOfTimeline || !room || !store.client) return;
  // Only notify for actual messages
  if (event.getType() !== EventType.RoomMessage && event.getType() !== 'm.room.encrypted') return;
  
  // Don't notify for our own messages
  if (event.getSender() === store.client.getUserId()) return;

  const processor = new PushProcessor(store.client as MatrixClient);
  const actions = processor.actionsForEvent(event);
  
  if (actions.notify) {
      const content = event.getContent();
      const body = content.msgtype === 'm.image' ? 'Sent an image' : (content.body || 'New message');
      
      const n = new Notification(room.name || 'New Message', {
          body: body,
          icon: room.getMxcAvatarUrl() || undefined, // simplified, real app might need mxc conversion
      });
      console.log('Notification sent', n);
  }
};

const setupListeners = () => {
  if (!store.client) { console.error("Client not initialized"); return; };

  // Update list when sync finishes specific stages
  store.client.on(ClientEvent.Room, updateRooms); // New room joined
  // store.client.on(RoomEvent.Timeline, updateRooms); // New message received - replaced by handleTimelineEvent
  store.client.on(RoomEvent.Timeline, handleTimelineEvent);
  store.client.on(RoomEvent.Name, updateRooms); // Room name changed
  store.client.on(RoomEvent.Receipt, updateRooms); // Read receipts (clears unread)
  
  // Initial load
  updateRooms();
};

// 1. If client is ready on mount, set it up
onMounted(() => {
  if (store.client) {
    setupListeners();
  }
  
  if (Notification.permission === 'default') {
      Notification.requestPermission();
  }
  
  // Register PWA Service Worker
  subscribeToPush();
});

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  
  try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
          // VAPID Public Key from Sygnal
          const publicKey = 'BErt1bY4D7W9yvRy73AC5ojIJUxEZuDS92FBi6HJjqKCv20gKI16bWi-BDkXYj7YETl9kvGoJrZsjmxpnoegs8M'; 
          
          subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: publicKey
          });
      }
      
      if (subscription && store.client) {
          await registerMatrixPusher(subscription);
      }
      
  } catch (err) {
      console.error('PWA: Failed to subscribe to push', err);
  }
}

async function registerMatrixPusher(subscription: PushSubscription) {
    if (!store.client) return;
    
    try {
        const pushKey = subscription.getKey ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))) : '';
        const pushAuth = subscription.getKey ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))) : '';
        
        await store.client.setPusher({
            app_id: 'cc.jackg',
            app_display_name: 'Matrix Client',
            device_display_name: 'Web Client',
            pushkey: subscription.endpoint, 
            kind: 'http',
            lang: 'en',
            data: {
                url: 'http://sygnal:5000/_matrix/push/v1/notify',
            },
        });
        console.log('PWA: Matrix Pusher registered');
    } catch (e) {
        console.error('PWA: Failed to register pusher', e);
    }
}

// 2. If client initializes LATER (e.g. page refresh), watch for it
watch(
  () => store.client,
  (newClient) => {
    if (newClient) setupListeners();
  }
);

// 3. Clean up listeners when leaving the page to prevent memory leaks
onUnmounted(() => {
  if (store.client) {
    store.client.removeListener(ClientEvent.Room, updateRooms);
    store.client.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    store.client.removeListener(RoomEvent.Name, updateRooms);
    store.client.removeListener(RoomEvent.Receipt, updateRooms);
  }
});

const isLinkActive = (to: string) => {
    if (to === "/chat") return route.path === "/chat";
    return route.path.startsWith(to);
};
</script>
