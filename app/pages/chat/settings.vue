<template>
  <div class="container py-6 space-y-8 max-w-2xl">
    <h1 class="text-3xl font-bold tracking-tight">Settings</h1>

    <!-- Activity Status (Desktop Only) -->
    <div v-if="gameActivity.isSupported.value" class="space-y-4">
      <h2 class="text-xl font-semibold tracking-tight">Activity Status</h2>
      <p class="text-sm text-muted-foreground">
        Automatically detect running games and show them as your Matrix status.
        Uses Discord's detectable games database for recognition.
      </p>

      <div class="flex items-center justify-between rounded-lg border p-4">
        <div class="flex items-center gap-3">
          <Icon name="solar:gamepad-bold" class="h-5 w-5 text-muted-foreground" />
          <div class="space-y-0.5">
            <p class="text-sm font-medium">Enable Game Detection</p>
            <p class="text-xs text-muted-foreground">
              Scan running processes to detect games
            </p>
          </div>
        </div>
        <Switch 
          :checked="store.isGameDetectionEnabled" 
          @update:checked="store.toggleGameDetection()" 
        />
      </div>

      <!-- Current Activity Preview -->
      <div v-if="store.activityDetails?.is_running" class="rounded-lg border p-4 space-y-2">
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Activity</p>
        <div class="flex items-center gap-2">
          <Icon name="solar:gamepad-bold" class="h-4 w-4 text-emerald-500" />
          <span class="text-sm font-medium">{{ store.activityDetails.name }}</span>
        </div>
      </div>
    </div>

    <!-- Account -->
    <div class="space-y-4">
      <h2 class="text-xl font-semibold tracking-tight">Account</h2>
      
      <div v-if="!store.isCrossSigningReady" class="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 flex items-center justify-between">
          <div class="space-y-0.5">
              <p class="text-sm font-medium text-yellow-600 dark:text-yellow-500">Unverified Session</p>
              <p class="text-xs text-muted-foreground">Verify to access encrypted history</p>
          </div>
          <UiButton size="sm" variant="secondary" @click="store.requestVerification()">Verify</UiButton>
      </div>

      <UiButton variant="destructive" @click="logout">Logout</UiButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
    middleware: "auth",
});

import { Switch } from '~/components/ui/switch';

const store = useMatrixStore();
const gameActivity = useGameActivity();

function logout () {
    store.logout();
}
</script>

<style scoped>

</style>