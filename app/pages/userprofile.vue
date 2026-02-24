<template>
  <div class="flex items-center justify-center h-screen w-screen">
    <ProfileCard
      :user="userProfile"
    />
  </div>
</template>

<script lang="ts" setup>
const store = useMatrixStore();
const userId = store.user?.userId || "";
const userProfile = store.client?.getUser(userId) || { userId, displayName: "Unknown User" };
</script>

<style>

</style>