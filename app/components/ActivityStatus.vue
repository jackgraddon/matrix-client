<template>
  <div v-if="store.activityDetails?.is_running" class="flex items-center gap-2 min-w-0">
    <div class="relative flex-shrink-0">
      <Icon name="solar:gamepad-bold" class="h-3.5 w-3.5 text-emerald-500" />
      <span 
        class="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
      />
    </div>
    <span class="text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate leading-tight">
      Playing {{ store.activityDetails.name }}
    </span>
  </div>
</template>

<script setup lang="ts">
const store = useMatrixStore();
</script>
