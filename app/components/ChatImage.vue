<template>
  <div class="relative rounded-md overflow-hidden bg-muted/20" :class="containerClass" :style="placeholderStyle">
    <img
      v-if="imageUrl"
      :src="imageUrl"
      :alt="alt || 'Image'"
      class="max-w-full h-auto object-contain rounded-md"
      :class="imageClass"
      :width="displayWidth || undefined"
      :height="displayHeight || undefined"
      loading="lazy"
      @load="emit('load')"
    />
    <div v-else-if="isLoading" class="flex items-center justify-center bg-muted/50 rounded-md" :style="placeholderStyle">
       <span class="loading loading-spinner loading-sm text-muted-foreground">Loading image...</span>
    </div>
    <div v-else-if="error" class="flex flex-col items-center justify-center p-4 bg-muted/50 rounded-md text-xs text-destructive">
      <Icon name="solar:danger-triangle-bold" class="h-4 w-4 mb-1" />
      <span>Failed to load</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useMatrixStore } from '~/stores/matrix';
import { useAuthenticatedMedia } from '~/composables/useAuthenticatedMedia';

const props = defineProps<{
  mxcUrl?: string | null;
  encryptedFile?: any;
  alt?: string;
  containerClass?: string;
  imageClass?: string;
  maxWidth?: number;
  maxHeight?: number;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
}>();

const emit = defineEmits<{
  (e: 'load'): void
}>();

const store = useMatrixStore();
const encryptedParams = ref<{ url: string; file: any } | null>(null);

// We need two refs for logic splitting
// 1. Standard authenticated media (uses useAuthenticatedMedia hook)
// 2. Encrypted media (custom logic here)

const encryptedImageUrl = ref<string | null>(null);
const encryptedLoading = ref(false);
const encryptedError = ref<unknown>(null);

// Determine valid MXC for standard hook
const validStandardMxc = computed(() => {
  // Only use standard hook if NO encrypted file and YES mxcUrl
  if (!props.encryptedFile && props.mxcUrl) return props.mxcUrl;
  return null;
});

// Use standard hook for unencrypted
const { imageUrl: standardUrl, isLoading: standardLoading, error: standardError } = useAuthenticatedMedia(
  validStandardMxc,
  props.maxWidth || 800,
  props.maxHeight || 600,
  'scale'
);

// Unified state
const imageUrl = computed(() => encryptedImageUrl.value || standardUrl.value);
const isLoading = computed(() => encryptedLoading.value || standardLoading.value);
const error = computed(() => encryptedError.value || standardError.value);

// Compute display dimensions capped to maxWidth, preserving aspect ratio
const displayWidth = computed(() => {
  if (!props.intrinsicWidth || !props.intrinsicHeight) return null;
  const maxW = props.maxWidth || 400;
  if (props.intrinsicWidth <= maxW) return props.intrinsicWidth;
  return maxW;
});

const displayHeight = computed(() => {
  if (!props.intrinsicWidth || !props.intrinsicHeight) return null;
  const maxW = props.maxWidth || 400;
  if (props.intrinsicWidth <= maxW) return props.intrinsicHeight;
  return Math.round(props.intrinsicHeight * (maxW / props.intrinsicWidth));
});

// CSS style to reserve space before the image loads
const placeholderStyle = computed(() => {
  if (!displayWidth.value || !displayHeight.value) return {};
  return {
    width: `${displayWidth.value}px`,
    aspectRatio: `${displayWidth.value} / ${displayHeight.value}`,
  };
});



// ...

// Helper to decode Base64 (handling URL-safe variants)
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

  // Import Key
  const key = await window.crypto.subtle.importKey(
    'jwk',
    info.key,
    { name: 'AES-CTR' },
    false,
    ['encrypt', 'decrypt']
  );

  // Decode IV
  const iv = decodeBase64(info.iv);

  // Decrypt
  return await window.crypto.subtle.decrypt(
    {
      name: 'AES-CTR',
      counter: iv as any,
      length: 64 
    },
    key,
    data
  );
}

// Logic for encrypted file
const loadEncrypted = async () => {
  if (!props.encryptedFile || !store.client) return;
  
  // Clean up previous
  if (encryptedImageUrl.value) {
    URL.revokeObjectURL(encryptedImageUrl.value);
    encryptedImageUrl.value = null;
  }

  encryptedLoading.value = true;
  encryptedError.value = null;

  try {
    console.log('[ChatImage] Decrypting file:', props.encryptedFile);
    
    // 1. Download the encrypted file
    // Manual construction for authenticated media (MSC3916)
    // We need: /_matrix/client/v1/media/download/{serverName}/{mediaId}
    const mxc = props.encryptedFile.url;
    if (!mxc || !mxc.startsWith('mxc://')) {
        throw new Error('Invalid MXC URL');
    }
    
    const mxcParts = mxc.replace('mxc://', '').split('/');
    const serverName = mxcParts[0];
    const mediaId = mxcParts[1];
    const baseUrl = store.client.baseUrl;

    const httpUrl = `${baseUrl}/_matrix/client/v1/media/download/${serverName}/${mediaId}`;

    const headers: Record<string, string> = {};
    const token = store.client.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(httpUrl, { headers });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    // 2. Decrypt
    const decryptedBuffer = await decryptAttachment(arrayBuffer, props.encryptedFile);
    
    // 3. Create Blob
    const blob = new Blob([decryptedBuffer], { type: props.encryptedFile.mimetype || 'image/jpeg' });
    encryptedImageUrl.value = URL.createObjectURL(blob);
  } catch (err) {
    console.error('[ChatImage] Failed to decrypt image:', err);
    encryptedError.value = err;
  } finally {
    encryptedLoading.value = false;
  }
};

watch(() => props.encryptedFile, (newFile) => {
  if (newFile) {
    loadEncrypted();
  }
}, { immediate: true });

onUnmounted(() => {
  if (encryptedImageUrl.value) {
    URL.revokeObjectURL(encryptedImageUrl.value);
  }
});
</script>
