<template>
  <div class="flex items-center justify-center h-screen">
    <UiCard class="w-full sm:max-w-md">
      <UiCardHeader>
        <UiCardTitle>Welcome to Matrix Client</UiCardTitle>
        <UiCardDescription>Please login to continue</UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <div v-if="!isAuthenticated">
          <UiButton variant="default" as-child>
            <NuxtLink to="/login">
              Login
            </NuxtLink>
          </UiButton>
        </div>
        <div v-else class="flex flex-row gap-2">
          <p>You are logged in as {{ matrixStore.user?.userId }}</p>
          <UiButton variant="default" as-child>
            <NuxtLink to="/chat">
              Chat
            </NuxtLink>
          </UiButton>
          <UiButton variant="destructive" @click="logout">Logout</UiButton>
        </div>
      </UiCardContent>
    </UiCard>
  </div>
</template>

<script lang="ts" setup>
const matrixStore = useMatrixStore();
const { isAuthenticated } = storeToRefs(matrixStore);
const { logout } = matrixStore; // Actions can be destructured directly

// Auto navigate to chat if already logged in
onMounted(() => {
    if (isAuthenticated.value) {
        navigateTo('/chat');
    }
});
</script>

<style scoped>

</style>