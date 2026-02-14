import { defineNuxtPlugin } from '#app';
import { useMatrixStore } from '~/stores/matrix';

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

        // Validate data (Check for "undefined" string which caused your earlier crash)
        if (accessToken && userId && userId !== 'undefined') {
            console.log('Restoring Matrix session...');

            // Pass it to the store
            store.initClient(
                accessToken,
                userId,
                deviceId || undefined,
                refreshToken || undefined
            );
        }
    });

    return {
        provide: {
            matrix: () => store.client
        }
    };
});