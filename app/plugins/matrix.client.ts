
import { getSecret, getPref } from "~/composables/useAppStorage";

export default defineNuxtPlugin(async (nuxtApp) => {
    const store = useMatrixStore();
    const route = useRoute();

    // Prevent auto-login on the callback page to avoid race conditions
    if (!route.path.includes('/auth/callback')) {
        const accessToken = await getSecret('matrix_access_token');
        const userId = await getPref<string | null>('matrix_user_id', null);
        const deviceId = await getPref<string | null>('matrix_device_id', null);
        const refreshToken = await getSecret('matrix_refresh_token');

        // OIDC metadata needed to rebuild token refresh function
        const issuer = await getPref<string | null>('matrix_oidc_issuer', null);
        const clientId = await getPref<string | null>('matrix_oidc_client_id', null);
        const idTokenClaims = await getPref<any>('matrix_oidc_id_token_claims', undefined);

        console.log('[MatrixPlugin] Attempting session restoration', {
            hasAccessToken: !!accessToken,
            userId,
            deviceId,
            hasRefreshToken: !!refreshToken,
            hasIssuer: !!issuer,
            hasClientId: !!clientId,
            hasIdTokenClaims: !!idTokenClaims
        });

        // Validate data (Check for "undefined" string which caused your earlier crash)
        if (accessToken && userId && userId !== 'undefined') {
            console.log('Restoring Matrix session...');

            // Pass it to the store
            try {
                await store.initClient(
                    accessToken,
                    userId,
                    deviceId || undefined,
                    refreshToken || undefined,
                    issuer || undefined,
                    clientId || undefined,
                    idTokenClaims,
                );
                console.log('Matrix session restored successfully.');
            } catch (err) {
                console.error('Failed to restore Matrix session:', err);
            }
        } else {
            console.log('[MatrixPlugin] No session data found to restore.');
        }
    }

    return {
        provide: {
            matrix: () => store.client
        }
    };
});