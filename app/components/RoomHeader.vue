<template>
  <div class="flex flex-col min-w-0">
    <h1 class="text-lg font-semibold truncate">{{ name }}</h1>
    <p v-if="topic" class="text-xs text-muted-foreground truncate mt-1">{{ topic }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  topic?: string;
}>();
</script>
