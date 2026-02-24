<template>
  <aside class="w-60 flex flex-col shrink-0 h-full relative">
    <div class="p-4 border-b border-border/50">
      <h3 class="text-sm font-bold flex items-center gap-2">
        <Icon name="solar:users-group-rounded-bold" class="text-primary w-5 h-5" />
        Members
      </h3>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-6 custom-scrollbar">
      
      <div v-if="online.length > 0">
        <h4 class="px-2 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Online — {{ online.length }}
        </h4>
        <div class="space-y-0.5">
          <div 
            v-for="member in online" 
            :key="member.userId"
            class="group flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
            :class="{ 'bg-accent/80': selectedUserId === member.userId }"
            @click="(e) => openUserProfileCard(e, member.userId)"
          >
            <UserProfile 
              :user-id="member.userId"
              :name="member.name"
              :avatar-url="member.getMxcAvatarUrl()"
              size="list"
            />
          </div>
        </div>
      </div>

      <div v-if="offline.length > 0">
        <h4 class="px-2 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Offline — {{ offline.length }}
        </h4>
        <div class="space-y-0.5">
          <div 
            v-for="member in offline" 
            :key="member.userId"
            class="group flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
            :class="{ 'bg-accent/80': selectedUserId === member.userId }"
            @click="(e) => openUserProfileCard(e, member.userId)"
          >
            <UserProfile 
              :user-id="member.userId"
              :name="member.name"
              :avatar-url="member.getMxcAvatarUrl()"
              size="list"
            />
          </div>
        </div>
      </div>
    </div>
  </aside>

  <Teleport to="body">
    <div 
      v-if="selectedUserId && selectedUser" 
      class="fixed inset-0 z-[99]" 
      @click="closeProfileCard"
    ></div>
    
    <Transition name="popover">
      <div 
        v-if="selectedUserId && selectedUser"
        class="fixed z-[100] shadow-2xl"
        :style="{ top: profileCardPos.top, right: profileCardPos.right }"
      >
        <ProfileCard :userid="selectedUserId" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMatrixStore } from '~/stores/matrix';
import ProfileCard from './ProfileCard.vue'; 
import type { Room, RoomMember } from 'matrix-js-sdk';

const props = defineProps<{ room: Room }>();
const store = useMatrixStore();
const refreshKey = ref(0);

// --- Popover State ---
const selectedUserId = ref<string | null>(null);
const profileCardPos = ref({ top: '0px', right: '0px' });

// ProfileCard expects a Matrix User object, so we resolve it here
const selectedUser = computed(() => {
  if (!selectedUserId.value || !store.client) return null;
  return store.client.getUser(selectedUserId.value);
});

// --- Member Parsing & Sorting ---
const allMembers = computed(() => {
  refreshKey.value; // Tie this computed property to our manual refresh trigger
  if (!props.room) return [];
  
  return props.room.getMembersWithMembership('join').sort((a: RoomMember, b: RoomMember) => {
    // Sort by power level descending, then by name alphabetically
    if (b.powerLevel !== a.powerLevel) {
      return b.powerLevel - a.powerLevel;
    }
    return (a.name || '').localeCompare(b.name || '');
  });
});

// Active users (Online or Idle)
const online = computed(() => allMembers.value.filter(m => {
  const presence = m.user?.presence;
  return presence === 'online' || presence === 'unavailable';
}));

// Inactive users (Explicitly Offline, or unknown)
const offline = computed(() => allMembers.value.filter(m => {
  const presence = m.user?.presence;
  return !presence || presence === 'offline';
}));

// --- Profile Card Logic ---
function openUserProfileCard(event: MouseEvent, userId: string) {
  // If clicking the same user that is already open, toggle it off
  if (selectedUserId.value === userId) {
    closeProfileCard();
    return;
  }
  
  // Get the exact coordinates of the list item that was clicked
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  
  // Dynamically calculate where to place the card so it spawns to the LEFT of the sidebar.
  // We use window.innerWidth - rect.left to calculate the distance from the right edge of the screen.
  const spacingGap = 16; 
  const estimatedCardHeight = 250; // Approximated height of ProfileCard.vue to prevent bottom clipping
  
  profileCardPos.value = {
    // Math.min ensures the card doesn't push off the bottom edge of the screen if clicked near the bottom
    top: `${Math.min(rect.top, window.innerHeight - estimatedCardHeight - 20)}px`,
    right: `${window.innerWidth - rect.left + spacingGap}px`
  };

  selectedUserId.value = userId;
}

function closeProfileCard() {
  selectedUserId.value = null;
}

// --- Matrix Event Listeners for Live Updates ---
const onRoomMemberEvent = () => {
  refreshKey.value++;
};

onMounted(() => {
  if (store.client && props.room) {
    props.room.on('RoomMember.name' as any, onRoomMemberEvent);
    props.room.on('RoomMember.membership' as any, onRoomMemberEvent);
    props.room.on('RoomMember.powerLevel' as any, onRoomMemberEvent);
  }
});

onUnmounted(() => {
  if (store.client && props.room) {
    props.room.removeListener('RoomMember.name' as any, onRoomMemberEvent);
    props.room.removeListener('RoomMember.membership' as any, onRoomMemberEvent);
    props.room.removeListener('RoomMember.powerLevel' as any, onRoomMemberEvent);
  }
});
</script>

<style scoped>
/* Smooth pop-in animation for the profile card */
.popover-enter-active,
.popover-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateX(10px) scale(0.98);
}

/* Optional: Custom scrollbar styling for the member list */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(150, 150, 150, 0.3);
  border-radius: 4px;
}
</style>
