<template>
    <div class="flex flex-col h-screen">
        <header class="h-16 flex items-center px-4 gap-2 justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
                <Icon name="solar:chat-round-dots-bold" class="h-5 w-5" />
                Matrix Chat
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
                                <NuxtLink :to="link.to">
                                    <Icon
                                        :name="isLinkActive(link.to) ? `${link.icon}-bold` : `${link.icon}-linear`"
                                        class="h-4 w-4"
                                    />
                                    <!-- {{ link.name }} -->
                                </NuxtLink>
                            </UiButton>
                        </div>
                        <div class="flex flex-col gap-2 flex-1">
                            <!-- Sidebar Room List -->
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
                                    <Icon
                                        :name="isLinkActive(`/chat/people/${friend.roomId}`) ? 'solar:chat-round-dots-bold' : 'solar:chat-round-dots-linear'"
                                        class="h-4 w-4"
                                    />
                                    {{ friend.name }}
                                </NuxtLink>
                            </UiButton>
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
                                    <Icon
                                        :name="isLinkActive(`/chat/rooms/${room.roomId}`) ? 'solar:chat-round-dots-bold' : 'solar:chat-round-dots-linear'"
                                        class="h-4 w-4"
                                    />
                                    {{ room.name }}
                                </NuxtLink>
                            </UiButton>
                        </div>
                    </nav>
                    <footer class="p-2">
                        <UiButton variant="ghost" as-child>
                            <NuxtLink class="p-4 h-fit w-full flex justify-start" to="/chat/settings">
                                <UserProfile />
                            </NuxtLink>
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

import { Room, ClientEvent, RoomEvent, EventType } from 'matrix-js-sdk';
const route = useRoute();

const links = [
    { name: "Home", to: "/chat", icon: "solar:home-angle" },
    { name: "People", to: "/chat/people", icon: "solar:users-group-rounded" },
    { name: "Rooms", to: "/chat/rooms", icon: "solar:inbox-archive" },
];

const store = useMatrixStore();

// Reactive state for the UI
interface MappedRoom {
  roomId: string;
  name: string;
  lastMessage: string;
  lastActive: number;
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
    };

    if (dmRoomIds.has(room.roomId)) {
      // Find which user this DM is with
      const dmUserId = Object.entries(directContent)
        .find(([, ids]) => ids.includes(room.roomId))?.[0] ?? '';
      dmList.push({ ...mapped, dmUserId });
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
const setupListeners = () => {
  if (!store.client) { console.error("Client not initialized"); return; };

  // Update list when sync finishes specific stages
  store.client.on(ClientEvent.Room, updateRooms); // New room joined
  store.client.on(RoomEvent.Timeline, updateRooms); // New message received
  store.client.on(RoomEvent.Name, updateRooms); // Room name changed
  
  // Initial load
  updateRooms();
};

// 1. If client is ready on mount, set it up
onMounted(() => {
  if (store.client) {
    setupListeners();
  }
});

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
    store.client.removeListener(RoomEvent.Timeline, updateRooms);
    store.client.removeListener(RoomEvent.Name, updateRooms);
  }
});

const isLinkActive = (to: string) => {
    if (to === "/chat") return route.path === "/chat";
    return route.path.startsWith(to);
};
</script>
