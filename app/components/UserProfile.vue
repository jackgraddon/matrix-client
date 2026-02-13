<template>
  <div class="flex items-center gap-3">
    <UiAvatar class="h-10 w-10 border">
      <UiAvatarImage v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="user.displayName" class="object-cover" />
      <UiAvatarFallback>{{ initials }}</UiAvatarFallback>
    </UiAvatar>
    <div class="flex flex-col">
      <span class="text-sm font-medium leading-none">{{ user?.displayName }}</span>
      <span class="text-xs text-muted-foreground">{{ user?.userId }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const matrixStore = useMatrixStore();
const user = computed(() => matrixStore.user);

console.log(user.value);

const initials = computed(() => {
  const name = user.value?.displayName || user.value?.userId || "ME";
  return name.slice(0, 2).toUpperCase();
});
</script>
