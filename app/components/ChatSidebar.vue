<template>
    <aside class="flex h-full flex-col w-[250px] shrink-0">
        <header class="h-16 flex items-center px-4 gap-2 justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
                <Icon name="solar:chat-round-dots-bold" class="h-5 w-5" />
                Ruby Chat
            </h2>
            <div class="flex items-center gap-2">
                <ColorModeToggle />
            </div>
        </header>
        <nav class="grow flex-1 flex flex-col p-2 gap-2 overflow-y-auto">
            <div class="flex flex-col gap-2 flex-1">
                <!-- Sidebar Home actions -->
                <template v-if="isLinkActive('/chat')">
                    <UiButton variant="default" @click="store.openGlobalSearchModal()">
                        <Icon name="solar:add-circle-line-duotone" class="h-4 w-4" />
                        Find or start a chat
                    </UiButton>
                </template>

                <!-- Sidebar DM List -->
                <template v-if="isLinkActive('/chat/dms')">
                    <div 
                        v-for="friend in friends"
                        :key="friend.roomId"
                        role="button"
                        class="inline-flex items-center justify-start px-2 h-9 w-full rounded-md text-sm font-medium transition-colors cursor-pointer hover:bg-accent/50 group relative"
                        :class="[(isLinkActive(`/chat/dms/${friend.roomId}`) || store.activeVoiceCall?.roomId === friend.roomId) ? 'bg-secondary text-secondary-foreground' : '']"
                        @click="isVoiceChannel(store.client?.getRoom(friend.roomId)) ? store.joinVoiceChannel(friend.roomId) : (isLinkActive(`/chat/dms/${friend.roomId}`) ? null : navigateTo(`/chat/dms/${friend.roomId}`))"
                    >
                        <MatrixAvatar
                            :mxc-url="friend.avatarUrl"
                            :name="friend.name"
                            class="h-6 w-6 mr-1"
                            :size="64"
                        />
                        <span class="truncate">{{ friend.name }}</span>
                        
                        <div class="ml-auto flex items-center gap-1">
                            <!-- If it's a voice DM, add a button to open text chat -->
                            <NuxtLink v-if="isVoiceChannel(store.client?.getRoom(friend.roomId))" :to="`/chat/dms/${friend.roomId}`" @click.stop>
                                <UiButton variant="ghost" size="icon" class="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0">
                                    <Icon name="solar:chat-line-linear" class="h-4 w-4" />
                                </UiButton>
                            </NuxtLink>

                            <div v-if="friend.dmUserId?.startsWith('@discord_')" class="rounded-full w-[20px] h-[20px] flex items-center justify-center shrink-0" style="background-color: #5865F2;">
                                <Icon name="ic:round-discord" class="text-white" style="width: 12px; height: 12px;"/>
                            </div>

                            <div v-if="friend.unreadCount > 0" class="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {{ friend.unreadCount }}
                            </div>
                        </div>
                    </div>
                </template>

                <!-- Sidebar Room List -->
                <template v-if="isLinkActive('/chat/rooms')">
                    <div 
                        v-for="room in rooms"
                        :key="room.roomId"
                        role="button"
                        class="inline-flex items-center justify-start px-2 h-9 w-full rounded-md text-sm font-medium transition-colors cursor-pointer hover:bg-accent/50 group relative"
                        :class="[(isLinkActive(`/chat/rooms/${room.roomId}`) || store.activeVoiceCall?.roomId === room.roomId) ? 'bg-secondary text-secondary-foreground' : '']"
                        @click="isVoiceChannel(store.client?.getRoom(room.roomId)) ? store.joinVoiceChannel(room.roomId) : (isLinkActive(`/chat/rooms/${room.roomId}`) ? null : navigateTo(`/chat/rooms/${room.roomId}`))"
                    >
                        <MatrixAvatar
                            :mxc-url="room.avatarUrl"
                            :name="room.name"
                            class="h-6 w-6 mr-1"
                            :size="64"
                        />
                        <span class="truncate">{{ room.name }}</span>

                        <div class="ml-auto flex items-center gap-1">
                            <!-- If it's a voice room, add a button to open text chat -->
                            <NuxtLink v-if="isVoiceChannel(store.client?.getRoom(room.roomId))" :to="`/chat/rooms/${room.roomId}`" @click.stop>
                                <UiButton variant="ghost" size="icon" class="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0">
                                    <Icon name="solar:chat-line-linear" class="h-4 w-4" />
                                </UiButton>
                            </NuxtLink>

                            <div v-if="room.unreadCount > 0" class="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                {{ room.unreadCount }}
                            </div>
                        </div>
                    </div>
                </template>

                <!-- Sidebar Space Categories List -->
                <template v-if="isLinkActive('/chat/spaces') && activeSpaceId">
                    <ChatSidebarCategory 
                        v-for="category in spaceCategories" 
                        :key="category.id"
                        :category="category"
                        :active-space-id="activeSpaceId"
                        :is-link-active="isLinkActive"
                        :depth="0"
                        :collapsed-categories="collapsedCategories"
                        @toggle-category="toggleCategory"
                    />
                </template>
            </div>
        </nav>
        
        <!-- Active Call Bar -->
        <div v-if="store.activeVoiceCall" class="mx-2 mb-2 p-2 bg-green-500/10 border border-green-500/20 rounded-md flex items-center justify-between gap-2 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <div class="flex flex-col min-w-0">
                <span class="text-[10px] font-bold text-green-500 uppercase tracking-wider">Active Call</span>
                <span class="text-xs font-semibold truncate">{{ store.activeVoiceCall.roomName || 'Voice Room' }}</span>
            </div>
            <UiButton 
                variant="destructive" 
                size="icon" 
                class="h-7 w-7 shrink-0 shadow-sm"
                @click="store.leaveVoiceChannel(store.activeVoiceCall.roomId)"
                title="Disconnect from call"
            >
                <Icon name="solar:end-call-bold" class="h-4 w-4" />
            </UiButton>
        </div>

        <footer class="p-2">
            <UiButton variant="ghost" as-child>
                <div class="p-4 h-fit w-full flex justify-start cursor-pointer" @click="navigateTo('/chat/settings')">
                    <UserProfile :user="store.user" />
                </div>
            </UiButton>
        </footer>
    </aside>
</template>

<script setup lang="ts">
import { Room, EventType, NotificationCountType } from 'matrix-js-sdk';
import MatrixAvatar from '~/components/MatrixAvatar.vue';
import ChatSidebarCategory from '~/components/ChatSidebarCategory.vue';
import { isVoiceChannel } from '~/utils/room';

const route = useRoute();
const store = useMatrixStore();

// Reactive state for the UI
interface MappedRoom {
  roomId: string;
  name: string;
  lastMessage: string;
  lastActive: number;
  avatarUrl?: string | null;
  unreadCount: number;
  dmUserId?: string;
}

interface SpaceCategory {
  id: string;
  name: string;
  avatarUrl?: string | null;
  rooms: MappedRoom[];
  children?: SpaceCategory[];
}

const mapRoom = (room: Room): MappedRoom => {
  const lastEvent = room.timeline.length > 0 
    ? room.timeline[room.timeline.length - 1] 
    : null;

  return {
    roomId: room.roomId,
    name: room.name || 'Unnamed Room',
    lastMessage: lastEvent ? lastEvent.getContent().body : 'No messages',
    lastActive: room.getLastActiveTimestamp() ?? 0,
    avatarUrl: room.getMxcAvatarUrl(),
    unreadCount: room.getUnreadNotificationCount(NotificationCountType.Total) ?? 0,
  };
};

const friends = computed(() => {
  if (!store.client) return [];
  // Register dependency on activeVoiceCall for icon updates
  store.activeVoiceCall;
  
  const { directMessages } = store.hierarchy;
  const directEvent = store.client.getAccountData(EventType.Direct);
  const directContent: Record<string, string[]> = directEvent ? directEvent.getContent() as Record<string, string[]> : {};

  return directMessages.map(room => {
    const mapped = mapRoom(room);
    
    // Robustly find the DM partner's user ID
    // 1. Try account data (m.direct)
    let dmUserId = Object.entries(directContent)
      .find(([, ids]) => ids.includes(room.roomId))?.[0];
      
    // 2. Fallback: find the first member that isn't us
    if (!dmUserId && store.client) {
        const myUserId = store.client.getUserId();
        const otherMember = room.getJoinedMembers().find(m => m.userId !== myUserId);
        dmUserId = otherMember?.userId;
    }

    let avatarUrl = mapped.avatarUrl;
    if (store.client && dmUserId) {
        const user = store.client.getUser(dmUserId);
        if (user?.avatarUrl) {
            avatarUrl = user.avatarUrl;
        }
    }

    return { ...mapped, dmUserId: dmUserId || '', avatarUrl };
  }).sort((a, b) => b.lastActive - a.lastActive);
});

const rooms = computed(() => {
  if (!store.client) return [];
  // Register dependency on activeVoiceCall for icon updates
  store.activeVoiceCall;
  
  const { orphanRooms } = store.hierarchy;
  return orphanRooms.map(mapRoom).sort((a, b) => b.lastActive - a.lastActive);
});

const activeSpaceId = computed(() => {
  if (!route.params.id) return null;
  return Array.isArray(route.params.id) ? route.params.id[0] : route.params.id;
});

const collapsedCategories = ref<Set<string>>(new Set(
  typeof localStorage !== 'undefined' 
    ? JSON.parse(localStorage.getItem('matrix_collapsed_categories') || '[]') 
    : []
));

const toggleCategory = (categoryId: string) => {
  if (collapsedCategories.value.has(categoryId)) {
    collapsedCategories.value.delete(categoryId);
  } else {
    collapsedCategories.value.add(categoryId);
  }
  localStorage.setItem('matrix_collapsed_categories', JSON.stringify(Array.from(collapsedCategories.value)));
};

const isCategoryCollapsed = (categoryId: string) => collapsedCategories.value.has(categoryId);

const buildSpaceHierarchy = (spaceId: string, visited: Set<string> = new Set()): SpaceCategory | null => {
  if (visited.has(spaceId)) return null;
  visited.add(spaceId);

  const space = store.client!.getRoom(spaceId);
  if (!space) return null;

  const directRooms: Room[] = [];
  const subSpaces: Room[] = [];

  const childEvents = space.currentState.getStateEvents('m.space.child');
  childEvents.forEach(event => {
    const content = event.getContent();
    if (content && Array.isArray(content.via) && content.via.length > 0) {
      const roomId = event.getStateKey() as string;
      const room = store.client!.getRoom(roomId);
      if (room) {
        if (room.isSpaceRoom()) {
          subSpaces.push(room);
        } else {
          directRooms.push(room);
        }
      }
    }
  });

  const children: SpaceCategory[] = subSpaces
    .map(ss => buildSpaceHierarchy(ss.roomId, visited))
    .filter((c): c is SpaceCategory => c !== null);

  return {
    id: spaceId,
    name: space.name,
    avatarUrl: space.getMxcAvatarUrl(),
    rooms: directRooms.map(mapRoom).sort((a, b) => b.lastActive - a.lastActive),
    children
  };
};

const spaceCategories = computed(() => {
  // Access hierarchy for reactivity trigger
  store.hierarchy;
  // Register dependency on activeVoiceCall for icon updates
  store.activeVoiceCall;
  
  if (!store.client || !activeSpaceId.value) return [];
  
  const rootHierarchy = buildSpaceHierarchy(activeSpaceId.value);
  if (!rootHierarchy) return [];

  const categories: SpaceCategory[] = [];
  
  // Add "Rooms" category for direct rooms of the root space
  if (rootHierarchy.rooms.length > 0) {
    categories.push({
      id: 'rooms-' + activeSpaceId.value,
      name: 'Rooms',
      rooms: rootHierarchy.rooms
    });
  }

  // Add sub-categories
  if (rootHierarchy.children) {
    categories.push(...rootHierarchy.children);
  }

  console.log(`[ChatSidebar] Built hierarchy for space ${activeSpaceId.value}`);
  return categories;
});

const isLinkActive = (to: string) => {
    if (to === "/chat") return route.path === "/chat";
    return route.path.startsWith(to);
};

defineExpose({
    friends,
    rooms,
    spaceCategories
});
</script>
