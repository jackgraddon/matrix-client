<template>
  <div class="space-y-4">
    <h2 class="text-2xl font-semibold tracking-tight">General</h2>

    <div class="flex items-center gap-2">
      <ColorModeToggle />
    </div>

    <div v-if="$isTauri" class="space-y-4">
      <h3 class="text-xl font-semibold tracking-tight">Backend</h3>

      <div class="flex items-center justify-between rounded-lg border p-4">
        <div class="flex items-center gap-3">
          <Icon name="solar:upload-minimalistic-bold" class="h-5 w-5 text-muted-foreground" />
          <div class="space-y-0.5">
            <p class="text-sm font-medium">Updates</p>
            <p class="text-xs text-muted-foreground">
              Check for new versions of the application shell
            </p>
          </div>
        </div>
        <UiButton variant="outline" size="sm" @click="checkForUpdates" :disabled="isChecking">
          <Icon v-if="isChecking" name="svg-spinners:ring-resize" class="mr-2 h-4 w-4" />
          {{ isChecking ? 'Checking...' : 'Check for Updates' }}
        </UiButton>
      </div>

      <div v-if="updateInfo" class="rounded-lg border bg-accent/50 p-4 space-y-3">
          <div class="flex items-start justify-between">
              <div class="space-y-1">
                  <p class="text-sm font-semibold text-primary">New update available: v{{ updateInfo.version }}</p>
                  <p class="text-xs text-muted-foreground line-clamp-3">{{ updateInfo.body }}</p>
              </div>
          </div>
          <div class="flex gap-2">
            <UiButton size="sm" @click="installUpdate" :disabled="isInstalling">
                <Icon v-if="isInstalling" name="svg-spinners:ring-resize" class="mr-2 h-4 w-4" />
                {{ isInstalling ? 'Installing...' : 'Install & Restart' }}
            </UiButton>
            <UiButton variant="ghost" size="sm" @click="updateInfo = null" :disabled="isInstalling">
                Dismiss
            </UiButton>
          </div>
      </div>

      <div v-if="showUpToDateBanner" class="rounded-lg border bg-green-500/10 border-green-500/20 p-4">
        <p class="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2">
            <Icon name="solar:check-circle-bold" class="h-4 w-4" />
            You're on the latest version!
        </p>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="text-xl font-semibold tracking-tight">Rooms</h3>

      <div class="flex items-center justify-between rounded-lg border p-4">
        <div class="flex items-center gap-3">
          <Icon name="solar:ghost-bold" class="h-5 w-5 text-muted-foreground" />
          <div class="space-y-0.5">
            <p class="text-sm font-medium">Show Empty Rooms</p>
            <p class="text-xs text-muted-foreground">
              Display rooms where all other members have left
            </p>
          </div>
        </div>
        <UiSwitch v-model="showEmptyRoomsToggle" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
  icon: 'solar:settings-bold',
  category: 'app',
  title: 'General',
  place: 1
})

const store = useMatrixStore();
const gameActivity = useGameActivity();

const showEmptyRoomsToggle = computed({
  get: () => store.ui.showEmptyRooms,
  set: () => store.toggleShowEmptyRooms(),
});

const isChecking = ref(false);
const isInstalling = ref(false);
const updateInfo = ref<any>(null);
const showUpToDateBanner = ref(false);

const checkForUpdates = async () => {
    if (isChecking.value) return;

    isChecking.value = true;
    updateInfo.value = null;
    showUpToDateBanner.value = false;

    try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();

        if (update?.available) {
            updateInfo.value = update;
        } else {
            showUpToDateBanner.value = true;
            setTimeout(() => {
                showUpToDateBanner.value = false;
            }, 5000);
        }
    } catch (e) {
        console.error("Failed to check for updates:", e);
        // You could add a toast notification here if available
    } finally {
        isChecking.value = false;
    }
};

const installUpdate = async () => {
    if (!updateInfo.value || isInstalling.value) return;

    isInstalling.value = true;
    try {
        await updateInfo.value.downloadAndInstall();
        // The app will restart automatically if configured,
        // or you might need to trigger it. Tauri 2 usually handles it.
    } catch (e) {
        console.error("Failed to install update:", e);
        isInstalling.value = false;
    }
};

</script>

<style>

</style>