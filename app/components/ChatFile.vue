<template>
  <div class="flex items-center justify-between p-3 rounded-md bg-muted/50 border min-w-[250px] max-w-full gap-3">
    <div class="flex items-center gap-3 overflow-hidden">
      <div class="flex items-center justify-center w-10 h-10 rounded bg-background shrink-0 text-muted-foreground shadow-sm">
        <Icon name="solar:document-text-bold" class="w-6 h-6" />
      </div>
      <div class="flex flex-col overflow-hidden">
        <span class="text-sm font-medium truncate" :title="alt || 'File'">{{ alt || 'File' }}</span>
        <span class="text-[10px] text-muted-foreground uppercase mt-0.5">
          {{ encryptedFile ? 'Encrypted File' : 'File' }}
        </span>
      </div>
    </div>
    
    <UiButton 
      variant="secondary" 
      size="sm" 
      class="shrink-0 h-8 rounded-full px-3"
      @click="downloadFile"
      :disabled="isDownloading"
    >
      <Icon v-if="isDownloading" name="svg-spinners:ring-resize" class="h-4 w-4 mr-1.5" />
      <Icon v-else name="solar:download-linear" class="h-4 w-4 mr-1.5" />
      <span>{{ isDownloading ? '...' : 'Save' }}</span>
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner';

const props = defineProps<{
  mxcUrl?: string;
  encryptedFile?: any; // EncryptedFile from Matrix
  alt?: string;
}>();

const store = useMatrixStore();
const isDownloading = ref(false);

async function downloadFile() {
  if (isDownloading.value) return;
  if (!store.client) {
    toast.error('Client not initialized');
    return;
  }

  isDownloading.value = true;
  try {
    let blob: Blob;

    if (props.encryptedFile && props.encryptedFile.url) {
      // 1. Download encrypted blob
      const mxcUrl = props.encryptedFile.url;
      const response = await fetchAuthenticatedDownload(store.client, mxcUrl);
      const arrayBuffer = await response.arrayBuffer();

      // 2. Decrypt
      const decryptedBuffer = await decryptAttachment(arrayBuffer, props.encryptedFile);
      
      // Determine mimetype from encrypted info or fallback
      const mimetype = props.encryptedFile.mimetype || 'application/octet-stream';
      blob = new Blob([decryptedBuffer], { type: mimetype });
    } else if (props.mxcUrl) {
      // Unencrypted file
      const response = await fetchAuthenticatedDownload(store.client, props.mxcUrl);
      blob = await response.blob();
    } else {
      throw new Error('No URL provided');
    }

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = props.alt || 'downloaded_file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('File downloaded');

  } catch (err: any) {
    console.error('Download error:', err);
    toast.error(`Download failed: ${err.message || 'Unknown error'}`);
  } finally {
    isDownloading.value = false;
  }
}
</script>
