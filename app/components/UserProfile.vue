<template>
  <div class="flex items-center gap-3">
    <div class="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
        <NuxtImg v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="user.displayName" class="h-full w-full object-cover" />
        <span v-else class="text-sm font-medium text-muted-foreground">ME</span>
    </div>
    <div class="flex flex-col">
      <span class="text-sm font-medium leading-none">{{ user?.displayName }}</span>
      <span class="text-xs text-muted-foreground">{{ user?.userId }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const matrixStore = useMatrixStore();
const user = computed(() => matrixStore.user);
</script>
