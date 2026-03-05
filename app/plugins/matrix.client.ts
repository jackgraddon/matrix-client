
import { getSecret, getPref } from "../composables/useAppStorage";

/**
 * Matrix Client Initialization Plugin
 *
 * Handles session restoration from storage on app startup.
 * Uses a highly defensive approach to prevent JSON parse crashes from corrupt storage.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
    const store = useMatrixStore();
    const route = useRoute();

    console.log('[MatrixClient] Plugin loading...');

    // Prevent auto-login on the callback page to avoid race conditions
    if (route.path.includes('/auth/callback')) {
        console.log('[MatrixClient] Skipping auto-login on callback page.');
        return { provide: { matrix: () => store.client } };
    }

    try {
        const accessToken = await getSecret('matrix_access_token');
        const userId = await getPref('matrix_user_id', null);
        const deviceId = await getPref('matrix_device_id', null);
        const refreshToken = await getSecret('matrix_refresh_token');

        // OIDC metadata needed to rebuild token refresh function
        const issuer = await getPref('matrix_oidc_issuer', null);
        const clientId = await getPref('matrix_oidc_client_id', null);

        // Defensive retrieval of idTokenClaims - handling possible literal string corruption
        let idTokenClaims: any = undefined;
        try {
            const rawClaims = await getPref<any>('matrix_oidc_id_token_claims', undefined);
            if (rawClaims && typeof rawClaims === 'object' && !Array.isArray(rawClaims)) {
                idTokenClaims = rawClaims;
            } else if (rawClaims) {
                console.warn('[MatrixClient] idTokenClaims in storage is not a valid object, ignoring.', typeof rawClaims);
            }
        } catch (claimsErr) {
            console.error('[MatrixClient] Failed to load OIDC claims:', claimsErr);
        }

        // Validate data (Check for "undefined" string which caused earlier crashes)
        if (accessToken && userId && userId !== 'undefined' && userId !== 'null') {
            console.log('[MatrixClient] Attempting to restore Matrix session for:', userId);

            await store.initClient(
                accessToken,
                userId,
                deviceId || undefined,
                refreshToken || undefined,
                issuer || undefined,
                clientId || undefined,
                idTokenClaims,
            );
            console.log('[MatrixClient] Matrix session restored successfully.');
        } else {
            console.log('[MatrixClient] No active session found in storage.');
        }
    } catch (err) {
        console.error('[MatrixClient] Critical failure during session restoration:', err);
        // We don't re-throw here to allow the app to at least show the login page
    }

    return {
        provide: {
            matrix: () => store.client
        }
    };
});
