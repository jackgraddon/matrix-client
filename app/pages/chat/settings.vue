<template>
  <div class="container py-6 space-y-8 max-w-2xl">
    <h1 class="text-3xl font-bold tracking-tight">Settings</h1>

    <!-- Activity Status (Desktop Only) -->
    <div class="space-y-4">
      <h2 class="text-xl font-semibold tracking-tight">Status</h2>
      <div class="flex gap-2">
        <UiInput 
          v-model="manualStatusInput" 
          placeholder="What's on your mind?" 
          @keyup.enter="updateStatus"
        />
        <UiButton v-if="store.customStatus" variant="ghost" size="sm" @click="clearStatus">
          Clear
        </UiButton>
        <UiButton size="sm" @click="updateStatus">Set Status</UiButton>
      </div>
    </div>

    <div v-if="gameActivity.isSupported.value" class="space-y-4">
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
        <UiSwitch v-model="gameDetectionToggle" />
      </div>
    </div>
    
    <!-- Status Preview -->
    <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div class="p-6 space-y-4">
        <div class="space-y-1.5">
          <h3 class="font-semibold leading-none tracking-tight">Status Preview</h3>
          <p class="text-sm text-muted-foreground">This is how your status appears to others.</p>
        </div>
        
        <!-- Mock User Card -->
        <UserProfile
            :avatar-url="store.user?.avatarUrl"
            :name="store.user?.displayName || ' You'"
            :is-card="true"
            name-classes="text-sm"
        />

        <div v-if="gameActivity.isEnabled.value && !store.activityDetails?.is_running && !store.customStatus" class="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon name="svg-spinners:ring-resize" class="h-3.5 w-3.5" />
            <span>Scanning for games...</span>
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
      
      <div class="flex gap-3">
        <UiButton variant="default" @click="manageDevices">
          <Icon name="solar:user-outline" />
          Manage Account
        </UiButton>
        <UiButton variant="destructive" @click="logout">
          <Icon name="solar:logout-outline" />
          Logout
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { toast } from 'vue-sonner';

definePageMeta({
    middleware: "auth",
});


const store = useMatrixStore();
const gameActivity = useGameActivity();

const gameDetectionToggle = computed({
  get: () => store.isGameDetectionEnabled,
  set: (val: boolean) => store.setGameDetection(val),
});

const manualStatusInput = ref(store.customStatus || '');

function updateStatus() {
  store.setCustomStatus(manualStatusInput.value);
}

function clearStatus() {
  manualStatusInput.value = '';
  store.setCustomStatus(null);
}

async function manageDevices() {
  const oidcConfigStr = localStorage.getItem('matrix_oidc_config');
  if (oidcConfigStr) {
    try {
      const oidcConfig = JSON.parse(oidcConfigStr);
      if (oidcConfig.issuer) {
        const accountUrl = new URL('/account', oidcConfig.issuer).toString();
        const isTauri = !!(window as any).__TAURI_INTERNALS__;
        if (isTauri) {
          const { open } = await import('@tauri-apps/plugin-shell');
          await open(accountUrl);
        } else {
          window.open(accountUrl, '_blank');
        }
        return;
      }
    } catch(e) {
      console.error('Failed to parse OIDC config', e);
    }
  }
  toast.error("Could not determine account management URL");
}

function logout () {
    store.logout();
}
</script>

<style scoped>

</style>