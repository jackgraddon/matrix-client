<template>
  <div v-if="store.verificationModalOpen || store.secretStoragePrompt" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <UiCard class="w-full max-w-md p-6 bg-white dark:bg-zinc-900">
      
      <UiCardHeader>
        <UiCardTitle>Verify this device</UiCardTitle>
        <UiCardDescription>
          For security, verify this session with one of your other devices.
        </UiCardDescription>
      </UiCardHeader>

      <UiCardContent class="flex flex-col gap-6 py-4">

        <!-- Secret Storage / Backup Key Input -->
        <div v-if="store.secretStoragePrompt" class="text-center">
            <template v-if="store.isCrossSigningReady">
                <div class="text-green-600 mb-4 flex flex-col items-center">
                    <div class="text-4xl mb-2">✅</div>
                    <p class="font-bold">Verified!</p>
                </div>
                <p class="mb-4 text-sm text-muted-foreground">
                    To restore your secure message history, please enter your Security Key or Passphrase.
                </p>
            </template>
            <template v-else>
                <p class="mb-4 text-sm text-muted-foreground">
                    Please enter your Security Key or Passphrase to verify this session.
                </p>
            </template>

            <UiInput 
                v-model="backupKeyInput" 
                type="password" 
                placeholder="Security Key or Passphrase" 
                class="mb-4"
                @keyup.enter="submitKey"
            />
            <div class="flex gap-4 justify-center">
                <UiButton variant="secondary" @click="store.cancelSecretStorageKey()">
                    {{ store.isCrossSigningReady ? 'Skip History' : 'Cancel' }}
                </UiButton>
                <UiButton @click="submitKey">
                    {{ store.isCrossSigningReady ? 'Restore' : 'Verify' }}
                </UiButton>
            </div>
        </div>
        
        <div v-else-if="!store.sasEvent && !store.isVerificationCompleted" class="text-center">
          <template v-if="store.verificationInitiatedByMe">
             <p class="mb-4">Open Element (or your other client) and accept the verification request.</p>
             <div class="flex flex-col gap-4">
                 <div class="flex gap-4 justify-center">
                    <UiButton variant="destructive" @click="store.closeVerificationModal()">Cancel</UiButton>
                    <div class="flex items-center gap-2 text-sm text-muted-foreground">
                        <span class="animate-pulse">Waiting for other device...</span>
                    </div>
                 </div>
                 <div class="text-sm text-muted-foreground">or</div>
                 <UiButton variant="outline" @click="store.bootstrapVerification()">
                    Use Recovery Key / Passphrase
                 </UiButton>
             </div>
          </template>
          <template v-else>
             <p class="mb-4">New verification request from one of your devices.</p>
             <div class="flex gap-4 justify-center">
                <UiButton variant="destructive" @click="store.cancelVerification()">Decline</UiButton>
                <UiButton @click="store.acceptVerification()">Accept</UiButton>
             </div>
          </template>
        </div>

        <div v-else-if="store.sasEvent" class="text-center">
          <p class="mb-4 font-medium text-lg">Do these emojis match?</p>
          
          <div class="grid grid-cols-4 gap-4 mb-6">
            <div 
              v-for="(item, index) in store.sasEvent.sas.emoji" 
              :key="index"
              class="flex flex-col items-center p-2 bg-gray-100 dark:bg-zinc-800 rounded"
            >
              <span class="text-3xl">{{ item[0] }}</span> <span class="text-xs font-bold uppercase mt-1">{{ item[1] }}</span> </div>
          </div>

          <div class="flex gap-4 justify-center">
            <UiButton variant="destructive" @click="store.cancelVerification()">No, they don't</UiButton>
            <UiButton variant="default" @click="store.confirmSasMatch()">Yes, they match</UiButton>
          </div>
        </div>

        <div v-else-if="store.isVerificationCompleted" class="text-center text-green-600">
          <div class="text-4xl mb-2">✅</div>
          <p class="font-bold">Verified!</p>
          <UiButton class="mt-4" variant="outline" @click="store.closeVerificationModal()">Close</UiButton>
        </div>
        
        <!-- Fallback / Manual Options (e.g. if already verified but want to restore backup) -->
        <div v-else class="text-center">
            <template v-if="store.isCrossSigningReady">
                <div class="text-green-600 mb-4 flex flex-col items-center">
                    <div class="text-4xl mb-2">✅</div>
                    <p class="font-bold">This session is verified.</p>
                </div>
                <p class="mb-4 text-sm text-muted-foreground">
                    If you are missing messages, you can try restoring keys from backup.
                </p>
                <div class="flex flex-col gap-3">
                    <UiButton @click="store.requestVerification()">
                        Verify with another device
                    </UiButton>
                    <UiButton variant="outline" @click="store.bootstrapVerification()">
                        Restore from Backup (Bootstrap)
                    </UiButton>
                    <UiButton variant="ghost" @click="store.closeVerificationModal()">Close</UiButton>
                </div>
            </template>
            <template v-else>
                 <!-- Should normally be handled by verificationRequest logic above, but if we opened modal manually without a request: -->
                 <p class="mb-4">Verify this session to access encrypted history.</p>
                 <div class="flex flex-col gap-3">
                    <UiButton @click="store.requestVerification()">Start Verification</UiButton>
                    <UiButton variant="outline" @click="store.bootstrapVerification()">
                        Use Recovery Key
                    </UiButton>
                    <UiButton variant="ghost" @click="store.closeVerificationModal()">Cancel</UiButton>
                 </div>
            </template>
        </div>

      </UiCardContent>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
const store = useMatrixStore();
const backupKeyInput = ref('');

async function submitKey() {
    if (!backupKeyInput.value) return;
    await store.submitSecretStorageKey(backupKeyInput.value);
    backupKeyInput.value = ''; // Clear after submit
}
</script>
