import { defineNuxtPlugin } from '#app';
import { useMatrixStore } from '~/stores/matrix';

export default defineNuxtPlugin((nuxtApp) => {
    const store = useMatrixStore();
    const route = useRoute();

    nuxtApp.hook('app:mounted', () => {
        // Don't try to auto-login if we are currently handling a callback
        if (route.path.includes('/auth/callback')) return;

        // 1. Retrieve the session data we saved during login
        const accessToken = localStorage.getItem('matrix_access_token');
        const userId = localStorage.getItem('matrix_user_id');
        const deviceId = localStorage.getItem('matrix_device_id');

        // 2. validate we have the minimum required data
        if (accessToken && userId) {
            console.log('Matrix session found, initializing...');

            // 3. Pass the data to the store to restart the client
            store.initClient(accessToken, userId, deviceId || undefined);
        }
    });

    return {
        provide: {
            matrix: () => store.client
        }
    };
});