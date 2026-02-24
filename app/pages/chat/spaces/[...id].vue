<template>
  <Chat :is-dm="false" />
</template>

<script setup lang="ts">
import Chat from '~/components/Chat.vue';

const route = useRoute();
const store = useMatrixStore();

onMounted(() => {
  const params = route.params.id;
  if (Array.isArray(params) && params.length === 1) {
    const spaceId = params[0];
    const lastRoomId = store.lastVisitedRooms.spaces[spaceId];
    if (lastRoomId) {
      navigateTo(`/chat/spaces/${spaceId}/${lastRoomId}`, { replace: true });
    }
  }
});
</script>
