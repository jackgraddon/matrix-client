<template>
  <div v-if="store.verificationRequest" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <UiCard class="w-full max-w-md p-6 bg-white dark:bg-zinc-900">
      
      <UiCardHeader>
        <UiCardTitle>Verify this device</UiCardTitle>
        <UiCardDescription>
          For security, verify this session with one of your other devices.
        </UiCardDescription>
      </UiCardHeader>

      <UiCardContent class="flex flex-col gap-6 py-4">
        
        <div v-if="!store.sasEvent && !store.isVerificationCompleted" class="text-center">
          <template v-if="store.verificationInitiatedByMe">
             <p class="mb-4">Open Element (or your other client) and accept the verification request.</p>
             <div class="flex gap-4 justify-center">
                <UiButton variant="destructive" @click="store.cancelVerification()">Cancel</UiButton>
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                    <span class="animate-pulse">Waiting for other device...</span>
                </div>
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
              <span class="text-3xl">{{ item.symbol }}</span> <span class="text-xs font-bold uppercase mt-1">{{ item.label }}</span> </div>
          </div>

          <div class="flex gap-4 justify-center">
            <UiButton variant="destructive" @click="store.cancelVerification()">No, they don't</UiButton>
            <UiButton variant="default" @click="store.confirmSasMatch()">Yes, they match</UiButton>
          </div>
        </div>

        <div v-else-if="store.isVerificationCompleted" class="text-center text-green-600">
          <div class="text-4xl mb-2">✅</div>
          <p class="font-bold">Verified!</p>
        </div>

      </UiCardContent>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { useMatrixStore } from '~/stores/matrix';
const store = useMatrixStore();
</script>