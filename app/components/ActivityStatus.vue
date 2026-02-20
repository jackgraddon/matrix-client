<template>
  <div class="flex flex-col gap-1 min-w-0">
    <!-- Custom Status -->
    <div v-if="displayCustomStatus" class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon name="solar:chat-round-line-bold" class="w-4 h-4 text-blue-500" />
      <span class="text-foreground truncate">{{ displayCustomStatus }}</span>
    </div>

    <!-- Game Activity -->
    <GamePresence 
      v-if="displayActivity?.is_running" 
      variant="small" 
      :game="displayActivity" 
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  customStatus?: string | null;
  activityDetails?: { name: string; is_running: boolean } | null;
  useStore?: boolean;
}>();

const store = useMatrixStore();

const displayCustomStatus = computed(() => {
  if (props.customStatus !== undefined) return props.customStatus;
  if (props.useStore !== false) return store.customStatus;
  return null;
});

const displayActivity = computed(() => {
  if (props.activityDetails !== undefined) return props.activityDetails;
  if (props.useStore !== false) return store.activityDetails;
  return null;
});
</script>
