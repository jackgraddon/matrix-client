<template>
  <UiDialog :open="store.createRoomModalOpen" @update:open="(val) => { if(!val) store.closeCreateRoomModal() }">
    <UiDialogContent class="sm:max-w-[425px] bg-background border-border">
      <UiDialogHeader>
        <UiDialogTitle class="text-2xl font-bold">Create a room</UiDialogTitle>
      </UiDialogHeader>
      
      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <UiLabel for="name">Name</UiLabel>
          <UiInput id="name" v-model="name" placeholder="e.g. My Awesome Room" />
        </div>
        <div class="grid gap-2">
          <UiLabel for="topic">Topic (optional)</UiLabel>
          <UiTextarea id="topic" v-model="topic" placeholder="What's this room about?" rows="3" />
        </div>
        
        <div class="grid gap-2">
          <UiLabel>Privacy</UiLabel>
          <UiDropdownMenu>
            <UiDropdownMenuTrigger as-child>
              <UiButton variant="outline" class="w-full justify-start">
                <Icon :name="isPublic ? 'solar:globus-bold' : 'solar:lock-bold'" class="mr-2 h-4 w-4" />
                {{ isPublic ? 'Public room (anyone can find)' : 'Private room (invite only)' }}
                <Icon name="solar:alt-arrow-down-bold" class="ml-auto h-4 w-4 opacity-50" />
              </UiButton>
            </UiDropdownMenuTrigger>
            <UiDropdownMenuContent class="w-[375px]">
              <UiDropdownMenuItem @select="isPublic = false">
                <Icon name="solar:lock-bold" class="mr-2 h-4 w-4" />
                <div>
                  <div class="font-medium">Private room (invite only)</div>
                  <div class="text-xs text-muted-foreground">Only people invited will be able to find and join this room.</div>
                </div>
              </UiDropdownMenuItem>
              <UiDropdownMenuItem @select="isPublic = true">
                <Icon name="solar:globus-bold" class="mr-2 h-4 w-4" />
                <div>
                  <div class="font-medium">Public room (anyone can find)</div>
                  <div class="text-xs text-muted-foreground">Anyone can find and join this room.</div>
                </div>
              </UiDropdownMenuItem>
            </UiDropdownMenuContent>
          </UiDropdownMenu>
          <p class="text-[13px] text-muted-foreground mt-1">
            {{ isPublic ? 'Anyone on Matrix will be able to find and join this room.' : 'Only people invited will be able to find and join this room. You can change this at any time from room settings.' }}
          </p>
        </div>

        <div class="flex items-center justify-between space-x-2 pt-2">
          <div class="flex flex-col space-y-1">
            <UiLabel class="text-base">Enable end-to-end encryption</UiLabel>
            <p class="text-[13px] text-muted-foreground">
              You can't disable this later. Bridges & most bots won't work yet.
            </p>
          </div>
          <UiSwitch v-model:checked="enableEncryption" />
        </div>
        
        <div class="pt-2">
           <button class="text-sm text-sky-500 font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">Show advanced</button>
        </div>
      </div>
      
      <UiDialogFooter class="gap-2 sm:gap-0">
        <UiButton variant="ghost" @click="store.closeCreateRoomModal" :disabled="isSubmitting">Cancel</UiButton>
        <UiButton @click="handleCreate" :disabled="!name.trim() || isSubmitting">
          <UiSpinner v-if="isSubmitting" class="mr-2 h-4 w-4" />
          Create room
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { toast } from 'vue-sonner';

const store = useMatrixStore();
const name = ref('');
const topic = ref('');
const isPublic = ref(false);
const enableEncryption = ref(true);
const isSubmitting = ref(false);

const handleCreate = async () => {
  if (!name.value.trim() || isSubmitting.value) return;
  
  isSubmitting.value = true;
  try {
    const roomId = await store.createRoom({
      name: name.value.trim(),
      topic: topic.value.trim() || undefined,
      isPublic: isPublic.value,
      enableEncryption: enableEncryption.value
    });
    
    if (roomId) {
      store.closeCreateRoomModal();
      store.closeGlobalSearchModal();
      // Reset form
      name.value = '';
      topic.value = '';
      isPublic.value = false;
      enableEncryption.value = true;
      
      toast.success('Room created successfully');
      await navigateTo(`/chat/rooms/${roomId}`);
    }
  } catch (err: any) {
    console.error('Failed to create room:', err);
    toast.error('Failed to create room', { description: err.message });
  } finally {
    isSubmitting.value = false;
  }
};
</script>
