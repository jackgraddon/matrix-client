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
      <template v-else-if="userId || isSelf">
         <div class="mt-1.5 flex">
            <ActivityStatus :user-id="userId" />
         </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

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

const isSelf = computed(() => !!props.userId && props.userId === store.user?.userId);
</script>
