<template>
  <div class="flex items-center gap-3" :class="cardClasses">
    <MatrixAvatar
      :mxc-url="avatarUrl"
      :name="name"
      class="h-10 w-10 border shrink-0"
    />
    <div class="flex-1 overflow-hidden flex flex-col justify-center">
      <div class="flex items-center justify-between">
        <p class="font-medium leading-none truncate" :class="nameClasses">{{ name || 'Unknown' }}</p>
      </div>
      
      <!-- Topic if provided -->
      <p v-if="topic" class="text-xs text-muted-foreground truncate mt-1.5">{{ topic }}</p>

      <!-- Otherwise Status Line -->
      <template v-else>
         <div v-if="hasActivityOrStatus" class="mt-1.5 flex">
            <ActivityStatus 
              :custom-status="parsedCustomStatus"
              :activity-details="parsedActivityDetails"
              :use-store="isSelf"
            />
         </div>
         <div v-else class="flex items-center gap-1.5 mt-1.5">
            <div class="h-2 w-2 rounded-full shrink-0" :class="presenceDotColor"></div>
            <p class="text-xs text-muted-foreground truncate capitalize">{{ displayPresenceText }}</p>
         </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, onUnmounted } from 'vue';

const props = defineProps<{
  userId?: string;
  name?: string;
  avatarUrl?: string | null;
  topic?: string;
  isCard?: boolean;
  nameClasses?: string;
}>();

const store = useMatrixStore();

const cardClasses = computed(() => {
  return props.isCard 
    ? "rounded-md border p-3 bg-background/50" 
    : "";
});

// Presence logic for external users
const presenceStatusMsg = ref<string | null>(null);
const presenceStatus = ref<string>('offline');

const fetchPresence = () => {
    if (!props.userId || props.userId === store.user?.userId || !store.client) {
        presenceStatusMsg.value = null;
        presenceStatus.value = 'online'; // Assuming self is online
        return;
    }
    const user = store.client.getUser(props.userId);
    if (user) {
        presenceStatusMsg.value = user.presenceStatusMsg || null;
        presenceStatus.value = user.presence || 'offline';
    } else {
        presenceStatusMsg.value = null;
        presenceStatus.value = 'offline';
    }
}

const handlePresenceEvent = (event: any, user: any) => {
    if (user && user.userId === props.userId) {
        presenceStatusMsg.value = user.presenceStatusMsg || null;
        presenceStatus.value = user.presence || 'offline';
    }
}

onMounted(() => {
    fetchPresence();
    if (store.client) {
        store.client.on('User.presence' as any, handlePresenceEvent);
    }
});

onUnmounted(() => {
    if (store.client) {
        store.client.removeListener('User.presence' as any, handlePresenceEvent);
    }
});

watch(() => props.userId, fetchPresence);

const isSelf = computed(() => !props.userId || props.userId === store.user?.userId);

const parsedActivityDetails = computed(() => {
    if (isSelf.value) return undefined;
    
    if (presenceStatusMsg.value && presenceStatusMsg.value.startsWith('Playing ')) {
        return {
            name: presenceStatusMsg.value.substring(8),
            is_running: true
        };
    }
    return null;
});

const parsedCustomStatus = computed(() => {
    if (isSelf.value) return undefined;
    
    if (presenceStatusMsg.value && !presenceStatusMsg.value.startsWith('Playing ')) {
        return presenceStatusMsg.value;
    }
    return null;
});

const hasActivityOrStatus = computed(() => {
    if (isSelf.value) {
        return !!(store.customStatus || store.activityDetails?.is_running);
    }
    return !!(parsedCustomStatus.value || parsedActivityDetails.value?.is_running);
});

const presenceDotColor = computed(() => {
    if (isSelf.value) return 'bg-emerald-500';
    if (presenceStatus.value === 'online') return 'bg-emerald-500';
    if (presenceStatus.value === 'unavailable') return 'bg-yellow-500';
    return 'bg-gray-400 dark:bg-gray-600';
});

const displayPresenceText = computed(() => {
    if (isSelf.value) return 'Online';
    if (presenceStatus.value === 'online') return 'Online';
    if (presenceStatus.value === 'unavailable') return 'Idle';
    return 'Offline';
});
</script>
