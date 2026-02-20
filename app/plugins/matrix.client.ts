
export default defineNuxtPlugin((nuxtApp) => {
    const store = useMatrixStore();
    const route = useRoute();

    nuxtApp.hook('app:mounted', () => {
        // Prevent auto-login on the callback page to avoid race conditions
        if (route.path.includes('/auth/callback')) return;

        const accessToken = localStorage.getItem('matrix_access_token');
        const userId = localStorage.getItem('matrix_user_id');
        const deviceId = localStorage.getItem('matrix_device_id');
        const refreshToken = localStorage.getItem('matrix_refresh_token');

        // OIDC metadata needed to rebuild token refresh function
        const issuer = localStorage.getItem('matrix_oidc_issuer');
        const clientId = localStorage.getItem('matrix_oidc_client_id');
        const idTokenClaimsRaw = localStorage.getItem('matrix_oidc_id_token_claims');
        const idTokenClaims = idTokenClaimsRaw ? JSON.parse(idTokenClaimsRaw) : undefined;

        // Validate data (Check for "undefined" string which caused your earlier crash)
        if (accessToken && userId && userId !== 'undefined') {
            console.log('Restoring Matrix session...');

            // Pass it to the store
            store.initClient(
                accessToken,
                userId,
                deviceId || undefined,
                refreshToken || undefined,
                issuer || undefined,
                clientId || undefined,
                idTokenClaims,
            );
        }
    });

    return {
        provide: {
            matrix: () => store.client
        }
    };
});