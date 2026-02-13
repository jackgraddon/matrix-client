import { defineNuxtPlugin } from '#app';
import { useMatrixStore } from '~/stores/matrix';

export default defineNuxtPlugin((nuxtApp) => {
    const store = useMatrixStore();

    nuxtApp.hook('app:mounted', () => {
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
            // Note: This injects the *current* state of the client. 
            // Since initClient is async/happens on mount, this might be null initially.
            // In your components, it is safer to use `useMatrixStore().client`.
            matrix: () => store.client
        }
    };
});