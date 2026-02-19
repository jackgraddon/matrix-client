<template>
  <div class="relative inline-flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40">
    <img
      v-if="imageUrl"
      :src="imageUrl"
      :alt="alt || 'Sticker'"
      class="max-w-full max-h-full object-contain drop-shadow-md rounded-2xl"
      loading="lazy"
      @load="emit('load')"
    />
    
    <div v-else-if="isLoading" class="flex items-center justify-center text-muted-foreground/50">
       <Icon name="svg-spinners:ring-resize" class="w-6 h-6" />
    </div>

    <div v-else-if="error" class="flex flex-col items-center justify-center text-destructive/50">
      <Icon name="solar:danger-triangle-bold" class="h-6 w-6 mb-1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, computed } from 'vue';
import { useMatrixStore } from '~/stores/matrix';
import { useAuthenticatedMedia } from '~/composables/useAuthenticatedMedia';

const props = defineProps<{
  mxcUrl?: string | null;
  encryptedFile?: any;
  alt?: string;
}>();

const emit = defineEmits<{
  (e: 'load'): void
}>();

const store = useMatrixStore();
const encryptedImageUrl = ref<string | null>(null);
const encryptedLoading = ref(false);
const encryptedError = ref<unknown>(null);

// Only use standard hook if NO encrypted file and YES mxcUrl
const validStandardMxc = computed(() => {
  if (!props.encryptedFile && props.mxcUrl) return props.mxcUrl;
  return null;
});

// Use standard hook for unencrypted (capped at 256x256 for stickers)
const { imageUrl: standardUrl, isLoading: standardLoading, error: standardError } = useAuthenticatedMedia(
  validStandardMxc,
  256, 
  256,
  'scale'
);

// Unified state
const imageUrl = computed(() => encryptedImageUrl.value || standardUrl.value);
const isLoading = computed(() => encryptedLoading.value || standardLoading.value);
const error = computed(() => encryptedError.value || standardError.value);

// --- Encrypted File Logic (Preserved from ChatImage just in case) ---
function decodeBase64(str: string): Uint8Array {
  const padded = str.padEnd(str.length + (4 - str.length % 4) % 4, '=');
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decryptAttachment(data: ArrayBuffer, info: any): Promise<ArrayBuffer> {
  if (!info.key || !info.iv) throw new Error('Missing key or iv');
  const key = await window.crypto.subtle.importKey(
    'jwk', info.key, { name: 'AES-CTR' }, false, ['encrypt', 'decrypt']
  );
  const iv = decodeBase64(info.iv);
  return await window.crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: iv as any, length: 64 }, key, data
  );
}

const loadEncrypted = async () => {
  if (!props.encryptedFile || !store.client) return;
  
  if (encryptedImageUrl.value) {
    URL.revokeObjectURL(encryptedImageUrl.value);
    encryptedImageUrl.value = null;
  }

  encryptedLoading.value = true;
  encryptedError.value = null;

  try {
    const mxc = props.encryptedFile.url;
    if (!mxc || !mxc.startsWith('mxc://')) throw new Error('Invalid MXC URL');
    
    const mxcParts = mxc.replace('mxc://', '').split('/');
    const httpUrl = `${store.client.baseUrl}/_matrix/client/v1/media/download/${mxcParts[0]}/${mxcParts[1]}`;

    const headers: Record<string, string> = {};
    const token = store.client.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(httpUrl, { headers });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const decryptedBuffer = await decryptAttachment(arrayBuffer, props.encryptedFile);
    
    const blob = new Blob([decryptedBuffer], { type: props.encryptedFile.mimetype || 'image/png' });
    encryptedImageUrl.value = URL.createObjectURL(blob);
  } catch (err) {
    console.error('[ChatSticker] Decryption failed:', err);
    encryptedError.value = err;
  } finally {
    encryptedLoading.value = false;
  }
};

watch(() => props.encryptedFile, (newFile) => {
  if (newFile) loadEncrypted();
}, { immediate: true });

onUnmounted(() => {
  if (encryptedImageUrl.value) URL.revokeObjectURL(encryptedImageUrl.value);
});
</script>