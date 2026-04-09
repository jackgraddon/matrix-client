import { cacheDecryptedEvent } from '../utils/notification-cache';

export default defineNuxtPlugin(() => {
    if (import.meta.server || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', async (event) => {
        if (event.data?.type !== 'DECRYPT_EVENT') return;

        const port  = event.ports[0];
        if (!port) return;

        const matrixEvent = event.data.event;

        try {
            const store  = useMatrixStore();
            const client = store.client;

            if (!client) {
                port.postMessage({ decrypted: null });
                return;
            }

            // Re-hydrate as a MatrixEvent and decrypt
            const { MatrixEvent } = await import('matrix-js-sdk');
            const mxEvent = new MatrixEvent(matrixEvent);

            await client.decryptEventIfNeeded(mxEvent);

            if (mxEvent.isDecryptionFailure()) {
                port.postMessage({ decrypted: null });
                return;
            }

            const content = mxEvent.getContent();
            // Opportunistically cache the result while we have it
            if (mxEvent.getId()) {
                await cacheDecryptedEvent(mxEvent.getId()!, content);
            }

            port.postMessage({ decrypted: content });
        } catch (e) {
            console.warn('[SW Bridge] Decryption failed:', e);
            port.postMessage({ decrypted: null });
        }
    });
});
