import { createClient, IndexedDBStore } from "matrix-js-sdk";

export default defineNuxtPlugin({
    name: 'matrix-client',
    parallel: true,
    async setup() {
        const config = useRuntimeConfig();
        const baseUrl = (config.public.matrix?.baseUrl ?? 'https://matrix.org') as string;

        // Setup Persistent Storage
        const store = new IndexedDBStore({
            indexedDB: window.indexedDB,
            localStorage: window.localStorage,
            dbName: "matrix-web-store",
        });

        // Create the Client
        // Check for existing session in localStorage
        const accessToken = window.localStorage.getItem("matrix_access_token");
        const userId = window.localStorage.getItem("matrix_user_id");
        const deviceId = window.localStorage.getItem("matrix_device_id");

        const client = createClient({
            baseUrl,
            store,
            userId: userId || undefined,
            accessToken: accessToken || undefined,
            deviceId: deviceId || undefined,
        });

        await store.startup();

        return {
            provide: {
                matrix: client
            }
        };
    }
});