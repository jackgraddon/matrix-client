import { ref, watch, onUnmounted, type MaybeRefOrGetter, toValue } from 'vue';
import { useMatrixStore } from '~/stores/matrix';

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

        // Manually construct the client/v1 URL for MSC3916 (Authenticated Media)
        // client.mxcUrlToHttp uses the old _matrix/media/v3 API which returns 404 on this server
        // We need: /_matrix/client/v1/media/thumbnail/{serverName}/{mediaId}

        const mxcParts = mxc.replace('mxc://', '').split('/');
        const serverName = mxcParts[0];
        const mediaId = mxcParts[1];

        // Base URL from client
        const baseUrl = store.client.baseUrl;

        let httpUrl = `${baseUrl}/_matrix/client/v1/media/thumbnail/${serverName}/${mediaId}?width=${width}&height=${height}&method=${resizeMethod}`;

        // Fetch with authentication
        const accessToken = store.client.getAccessToken();

        try {
            const response = await fetch(httpUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
            }

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
