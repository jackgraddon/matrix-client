<template>
  <div class="flex flex-col w-[400px] p-4 rounded-lg bg-background border-1 border-border">
    <div class="mb-2">
      <UserProfile
        :user="user"
        size="full"
      />
    </div>
    <div class="text-sm text-muted-foreground mb-4 italic bio-display">
      {{ displayBio || 'No biography set.' }}
    </div>

    <!-- Activity -->
    <div class="mb-4">
      <ActivityStatus :user-id="userid" variant="large" :show-basic-presence="false" />
    </div>

    <div class="flex items-center gap-2 mt-auto">
      <UiButton
        @click="sendMessage"
      >Message</UiButton>
      <UiButton>Copy ID</UiButton>
    </div>
  </div>
</template>

<script lang="ts" setup>

const props = defineProps<{
  userid: string;
}>();

const store = useMatrixStore();
const uiStore = useUIStore();
const matrixService = useMatrixService();
const presenceStore = usePresenceStore();

const user = computed(() => store.client?.getUser(props.userid));
const bioCache = ref<string | null>(null);

const displayBio = computed(() => {
  if (props.userid === store.user?.userId) {
    return store.user.description || null;
  }
  return bioCache.value;
});

async function fetchBio() {
  if (props.userid === store.user?.userId) {
    // Already handled by computed
    return;
  }

  if (!store.client || !props.userid) return;
  try {
    const profile = await store.client.getProfileInfo(props.userid);
    bioCache.value = (profile as any).description || (profile as any).status_msg_description || (profile as any)['org.matrix.msc2403.description'] || null;
  } catch (err) {
    console.warn('Failed to fetch user bio:', err);
    bioCache.value = null;
  }
}

onMounted(fetchBio);
watch(() => props.userid, fetchBio);

async function sendMessage() {
  if (!store.client) return;

  // 1. Check if we already have a known DM room with this user
  let roomId = store.directMessageMap?.[props.userid];

  // 2. Fallback: search joined rooms for a 1:1 DM
  if (!roomId) {
    const myUserId = store.client.getUserId();
    const rooms = store.client.getRooms();
    const existingRoom = rooms.find(r => {
      const members = r.getJoinedMembers();
      return members.length === 2 &&
             members.some(m => m.userId === props.userid) &&
             members.some(m => m.userId === myUserId);
    });
    if (existingRoom) {
      roomId = existingRoom.roomId;
    }
  }

  // 3. If room exists, navigate to it
  if (roomId) {
    uiStore.setUISelectedUser(null);
    await navigateTo(`/chat/dms/${roomId}`);
    return;
  }

  // 4. Create a new DM
  try {
    const response = await store.client.createRoom({
      invite: [props.userid],
      is_direct: true,
      preset: 'trusted_private_chat' as any,
      visibility: 'private' as any,
    });
    uiStore.setUISelectedUser(null);
    await navigateTo(`/chat/dms/${response.room_id}`);
  } catch (err) {
    console.error('Failed to create DM:', err);
  }
}
</script>

<style>
.bio-display {
  white-space: pre-line; 
  word-break: break-word; 
  line-height: 1.5;
}
</style>