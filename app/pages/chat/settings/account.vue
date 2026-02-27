<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Account</h2>
    </div>

    <div>  
      <UiCard>
        <UiCardHeader>
          <UserProfile
            :user="store.user"
          />
        </UiCardHeader>
        <UiCardContent class="space-y-4">
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
          <div class="space-y-2">
            <h4 class="text-md font-semibold tracking-tight">Edit Profile</h4>
            <div class="flex gap-2">
              <UiButton 
                :variant="updatedUserInfo.avatarFile.size > 0 ? 'default' : 'outline'"
                @click="uploadAvatar"
              >
                <Icon :name="updatedUserInfo.avatarFile.size > 0 ? 'solar:check-circle-outline' : 'solar:upload-outline'" />
                <p v-if="updatedUserInfo.avatarFile.size > 0">Uploaded</p>
                <p v-else>Upload Avatar</p>
              </UiButton>
              <UiInput
                label="Display Name"
                :placeholder="updatedUserInfo.displayName"
                v-model="updatedUserInfo.displayName"
                @keyup.enter="updateProfile"
                @update:model-value="updatedUserInfo.isUpdating = true"
              />
              <UiButton 
                aria-label="Save"
                title="Save"
                :variant="updatedUserInfo.isUpdating ? 'default' : 'outline'"
                :disabled="!updatedUserInfo.isUpdating"
                @click="updateProfile"
              >
                Save Changes
              </UiButton>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
    </div>
    <!-- Activity Status (Desktop Only) -->
    <div class="space-y-4">
      <h3 class="text-xl font-semibold tracking-tight">Status</h3>
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

    <div>
      <h2 class="text-lg font-semibold tracking-tight">Account Linking</h2>
      <p class="text-sm text-muted-foreground">Link your account to other services.</p>
      <UiButton>Jellyfin</UiButton>
    </div>

    <div>
      <h2 class="text-lg font-semibold tracking-tight">Bridging</h2>
      <p class="text-sm text-muted-foreground">Connect your off-platform chats to Matrix. Your homeserver must support the bridges to connect them.</p>
      <UiButton>Discord</UiButton>
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
</template>

<script lang="ts" setup>
import { toast } from 'vue-sonner';

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

// Account Settings
const updatedUserInfo = ref(
  {
    isUpdating: false,
    displayName: store.user?.displayName,
    avatarFile: new File([], ""),

  }
);

function uploadAvatar() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.click();
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      updatedUserInfo.value.avatarFile = file;
      updatedUserInfo.value.isUpdating = true;
    }
  };
}

async function updateProfile() {
  if (updatedUserInfo.value.displayName) {
    await store.setProfileDisplayName(updatedUserInfo.value.displayName);
  }
  if (updatedUserInfo.value.avatarFile.size > 0) {
    await store.uploadAndSetProfileAvatar(updatedUserInfo.value.avatarFile);
  }
  updatedUserInfo.value.isUpdating = false;

  navigateTo('/chat/settings/account');
}

async function linkAccount(account: string) {
  
}

async function unlinkAccount(account: string) {
  
}

async function bridge(account: string) {
  
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

<style>

</style>