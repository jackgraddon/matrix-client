
/**
 * crypto-db.ts
 *
 * Simple IndexedDB utility for storing and retrieving CryptoKeys.
 * Accessible from both the main thread and the Service Worker.
 */

const DB_NAME = 'tumult-crypto-storage';
const STORE_NAME = 'keys';
const KEY_NAME = 'notification-decryption-key';

export async function openCryptoDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveCryptoKey(key: CryptoKey): Promise<void> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(key, KEY_NAME);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getCryptoKey(): Promise<CryptoKey | null> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(KEY_NAME);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Returns the existing notification key or generates a new one.
 * Includes a JWK export for sharing with the Relay.
 */
export async function getOrCreateNotificationKey(): Promise<{ key: CryptoKey, jwk: JsonWebKey }> {
    let key = await getCryptoKey();
    if (!key) {
        console.log('[CryptoDB] Generating new non-extractable notification key...');
        const rawKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true, // extractable for the initial export
            ['encrypt', 'decrypt']
        );
        const jwk = await crypto.subtle.exportKey('jwk', rawKey);

        // Re-import as non-extractable for persistence
        key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM', length: 256 },
            false, // non-extractable as per 2026 recommendations
            ['encrypt', 'decrypt']
        );
        await saveCryptoKey(key);
        return { key, jwk };
    }

    try {
        const jwk = await crypto.subtle.exportKey('jwk', key);
        return { key, jwk };
    } catch (e) {
        console.warn('[CryptoDB] Key is not extractable, generating a fresh one for re-registration.');
        const rawKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        const jwk = await crypto.subtle.exportKey('jwk', rawKey);
        key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        await saveCryptoKey(key);
        return { key, jwk };
    }
}
