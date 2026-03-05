
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
        // Defensive retrieval of all session data
        const safeGetItem = (key: string) => {
            if (typeof localStorage === 'undefined') return null;
            const val = localStorage.getItem(key);
            if (!val || val === 'undefined' || val === 'null') return null;
            if (val.startsWith('object ') || val.startsWith('[object')) {
                console.warn(`[MatrixClient] Found corrupted key ${key}, clearing.`);
                localStorage.removeItem(key);
                return null;
            }
            return val;
        };

        const accessToken = await getSecret('matrix_access_token');
        const userIdRaw = safeGetItem('matrix_user_id');
        const deviceIdRaw = safeGetItem('matrix_device_id');
        const refreshToken = await getSecret('matrix_refresh_token');

        let userId = userIdRaw;
        if (userIdRaw) {
            try { userId = JSON.parse(userIdRaw); } catch (e) { userId = userIdRaw; }
        }

        let deviceId = deviceIdRaw;
        if (deviceIdRaw) {
            try { deviceId = JSON.parse(deviceIdRaw); } catch (e) { deviceId = deviceIdRaw; }
        }

        // OIDC metadata
        const issuerRaw = safeGetItem('matrix_oidc_issuer');
        let issuer = issuerRaw;
        if (issuerRaw) {
            try { issuer = JSON.parse(issuerRaw); } catch (e) { issuer = issuerRaw; }
        }

        const clientIdRaw = safeGetItem('matrix_oidc_client_id');
        let clientId = clientIdRaw;
        if (clientIdRaw) {
            try { clientId = JSON.parse(clientIdRaw); } catch (e) { clientId = clientIdRaw; }
        }

        let idTokenClaims: any = undefined;
        const claimsRaw = safeGetItem('matrix_oidc_id_token_claims');
        if (claimsRaw) {
            try {
                const parsed = JSON.parse(claimsRaw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    idTokenClaims = parsed;
                }
            } catch (e) {
                console.warn('[MatrixClient] Failed to parse idTokenClaims');
            }
        }

        // Validate data
        if (accessToken && userId && userId !== 'undefined') {
            console.log('[MatrixClient] Restoring session for:', userId);

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
                console.log('[MatrixClient] Matrix session restored successfully.');
            } catch (initErr) {
                console.error('[MatrixClient] initClient failed:', initErr);
                // If we get a token error, we might want to logout, but let's be careful
            }
        } else {
            console.log('[MatrixClient] No active session found.');
        }
    } catch (err) {
        console.error('[MatrixClient] Critical failure during restoration:', err);
    }

    return {
        provide: {
            matrix: () => store.client
        }
    };
});
