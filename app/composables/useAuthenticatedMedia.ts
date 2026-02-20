import type { MaybeRefOrGetter } from 'vue';

export function useAuthenticatedMedia(
    mxcUrlObj: MaybeRefOrGetter<string | null | undefined>,
    width?: number,
    height?: number,
    resizeMethod: 'crop' | 'scale' = 'crop'
) {
    const imageUrl = ref<string | null>(null);
    const isLoading = ref(false);
    const error = ref<unknown>(null);
    const store = useMatrixStore();

    let activeUrl: string | null = null;

    const fetchImage = async () => {
        const mxc = toValue(mxcUrlObj);

        // Revoke previous URL to avoid memory leaks
        if (activeUrl) {
            URL.revokeObjectURL(activeUrl);
            activeUrl = null;
            imageUrl.value = null;
        }

        if (!mxc || !store.client) {
            return;
        }

        isLoading.value = true;
        error.value = null;

        try {
            const response = await fetchAuthenticatedThumbnail(store.client, mxc, width, height, resizeMethod);
            const blob = await response.blob();
            activeUrl = URL.createObjectURL(blob);
            imageUrl.value = activeUrl;
        } catch (e) {
            console.error('Failed to load authenticated image:', e);
            error.value = e;
        } finally {
            isLoading.value = false;
        }
    };

    watch(() => toValue(mxcUrlObj), fetchImage, { immediate: true });

    onUnmounted(() => {
        if (activeUrl) {
            URL.revokeObjectURL(activeUrl);
        }
    });

    return { imageUrl, isLoading, error };
}
