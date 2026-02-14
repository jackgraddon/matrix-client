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
                            <UiButton 
                                v-if="isLinkActive('/chat/rooms')"
                                v-for="room in rooms"
                                :key="room.roomId"
                                :disabled="isLinkActive(room.roomId)"
                                :variant="isLinkActive(room.roomId) ? 'secondary' : 'ghost'"
                                class="justify-start"
                                as-child
                            >
                                <NuxtLink :to="`/chat/rooms/${room.roomId}`">
                                    <Icon
                                        :name="isLinkActive(room.roomId) ? 'solar:chat-round-dots-bold' : 'solar:chat-round-dots-linear'"
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

import { Room, ClientEvent, RoomEvent } from 'matrix-js-sdk';
const route = useRoute();

const links = [
    { name: "Home", to: "/chat", icon: "solar:home-angle" },
    { name: "People", to: "/chat/people", icon: "solar:users-group-rounded" },
    { name: "Rooms", to: "/chat/rooms", icon: "solar:hashtag" },
];

const store = useMatrixStore();

// Reactive state for the UI
const rooms = ref<{ roomId: string; name: string; lastMessage: string }[]>([]);

// Helper to format rooms for display
const updateRooms = () => {
  if (!store.client) return;
  
  // Get all joined rooms
  const matrixRooms = store.client.getVisibleRooms();
  
  // Map to a temporary array (including the raw timestamp for sorting)
  const mappedRooms = matrixRooms.map((room: Room) => {
    // Attempt to get the last message event for the preview text
    const lastEvent = room.timeline.length > 0 
      ? room.timeline[room.timeline.length - 1] 
      : null;

    return {
      roomId: room.roomId,
      name: room.name || 'Unnamed Room',
      lastMessage: lastEvent ? lastEvent.getContent().body : 'No messages',
      // Get the timestamp for sorting
      // Fallback to 0 if the room has no activity so it goes to the bottom
      lastActive: room.getLastActiveTimestamp() ?? 0 
    };
  });

  // Sort the array (Newest first)
  mappedRooms.sort((a, b) => b.lastActive - a.lastActive);

  // Update the reactive state
  rooms.value = mappedRooms;
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
