<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">My Chats</h1>

    <div v-if="!store.isSyncing" class="text-gray-500">
      <p>Syncing with Matrix...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { useMatrixStore } from '~/stores/matrix';
import { Room, ClientEvent, RoomEvent } from 'matrix-js-sdk';

const store = useMatrixStore();

// Reactive state for the UI
const rooms = ref<{ roomId: string; name: string; lastMessage: string }[]>([]);

// Helper to format rooms for display
const updateRooms = () => {
  if (!store.client) return;
  
  // Get all joined rooms
  const matrixRooms = store.client.getVisibleRooms();
  
  // Map them to a simple object Vue can render easily
  rooms.value = matrixRooms.map((room: Room) => {
    // Try to find the last message event
    const lastEvent = room.timeline.length > 0 
      ? room.timeline[room.timeline.length - 1] 
      : null;

    return {
      roomId: room.roomId,
      name: room.name || 'Unnamed Room',
      lastMessage: lastEvent ? lastEvent.getContent().body : 'No messages'
    };
  });
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
</script>