import { getSecret, getPref } from "~/composables/useAppStorage";
import { MatrixService } from "~/services/matrix.service";

export default defineNuxtPlugin(async (nuxtApp) => {
    const store = useMatrixStore();
    const uiStore = useUIStore();
    const route = useRoute();

    // Restore user preferences
    await Promise.all([
        store.initialize(),
        uiStore.initialize()
    ]);

    if (!route.path.includes('/auth/callback')) {
        const accessToken = await getSecret('matrix_access_token');
        const userId = await getPref('matrix_user_id', null);
        const deviceId = await getPref('matrix_device_id', null);
        const refreshToken = await getSecret('matrix_refresh_token');

        const issuer = await getPref('matrix_oidc_issuer', null);
        const clientId = await getPref('matrix_oidc_client_id', null);
        const idTokenClaims = await getPref('matrix_oidc_id_token_claims', undefined);

        if (accessToken && userId && userId !== 'undefined') {
            MatrixService.getInstance().initClient(
                accessToken,
                userId,
                deviceId || undefined,
                refreshToken || undefined,
                issuer || undefined,
                clientId || undefined,
                idTokenClaims,
            ).catch(() => {
                store.isRestoringSession = false;
            });
        } else {
            store.isRestoringSession = false;
        }
    } else {
        store.isRestoringSession = false;
    }

    return {
        provide: {
            matrix: () => store.client
        }
    };
});
