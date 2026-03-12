<template>
  <div class="overflow-y-scroll h-full w-full py-6 space-y-8">
    <div class="m-auto max-w-2xl px-4">
      <div class="flex items-center gap-4 mb-2">
        <UiButton
          v-if="isMobile"
          variant="ghost"
          size="icon-sm"
          @click="navigateTo('/chat')"
        >
          <Icon name="solar:alt-arrow-left-linear" class="h-6 w-6" />
        </UiButton>
        <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
      </div>
      <hr class="my-2">
      <NuxtPage />
    </div>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
    middleware: "auth",
});

const isMobile = ref(false);
const updateIsMobile = () => {
    isMobile.value = window.innerWidth < 768;
};

onMounted(() => {
    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
});

onUnmounted(() => {
    window.removeEventListener('resize', updateIsMobile);
});
</script>

<style scoped>

</style>