<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between px-1">
      <h2 class="text-2xl font-bold tracking-tight text-foreground">{{ title }}</h2>
    </div>

    <div v-if="loading" class="flex gap-4 overflow-hidden py-1">
      <div v-for="i in 6" :key="i" class="w-[180px] shrink-0 space-y-3">
        <UiSkeleton class="aspect-square rounded-lg" />
        <div class="space-y-1">
          <UiSkeleton class="h-4 w-3/4" />
          <UiSkeleton class="h-3 w-1/2" />
        </div>
      </div>
    </div>

    <div
      v-else-if="layout === 'scroll'"
      class="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-1 px-1 snap-x"
    >
      <MusicItem
        v-for="item in items"
        :key="item.Id"
        :item="item"
        class="w-[180px] shrink-0 snap-start"
      />
    </div>

    <div
      v-else-if="layout === 'grid'"
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 px-1"
    >
      <MusicItem
        v-for="item in items"
        :key="item.Id"
        :item="item"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BaseItemDto } from '~/types/jellyfin';
import MusicItem from './MusicItem.vue';

interface Props {
  title: string;
  items: BaseItemDto[];
  loading?: boolean;
  layout?: 'scroll' | 'grid';
}

withDefaults(defineProps<Props>(), {
  loading: false,
  layout: 'scroll'
});
</script>
