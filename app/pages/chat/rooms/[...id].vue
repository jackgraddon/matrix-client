<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <Chat :is-dm="false" />
  </div>
</template>

<script setup lang="ts">
import Chat from '~/components/Chat.vue';
</script>