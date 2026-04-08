
/**
 * crypto-db.ts
 * 
 * Simple IndexedDB utility for storing and retrieving CryptoKeys.
 * Accessible from both the main thread and the Service Worker.
 */

const DB_NAME = 'tumult-crypto-storage';
const STORE_NAME = 'keys';
const AUTH_STORE_NAME = 'auth';
const SHARE_STORE_NAME = 'shares';
const KEY_NAME = 'notification-decryption-key';

export async function openCryptoDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 3);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
            if (!db.objectStoreNames.contains(AUTH_STORE_NAME)) {
                db.createObjectStore(AUTH_STORE_NAME);
            }
            if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
                db.createObjectStore(SHARE_STORE_NAME);
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
 * Auth Storage Functions
 * Used to share credentials with the Service Worker for background decryption.
 */

export async function saveMatrixAuth(accessToken: string, homeserverUrl: string, deviceId?: string): Promise<void> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(AUTH_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(AUTH_STORE_NAME);
        store.put(accessToken, 'access_token');
        store.put(homeserverUrl, 'homeserver_url');
        if (deviceId) {
            store.put(deviceId, 'device_id');
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function clearMatrixAuth(): Promise<void> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(AUTH_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(AUTH_STORE_NAME);
        store.delete('access_token');
        store.delete('homeserver_url');

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function getMatrixAuth(): Promise<{ accessToken: string | null, homeserverUrl: string | null, deviceId: string | null }> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(AUTH_STORE_NAME, 'readonly');
        const store = transaction.objectStore(AUTH_STORE_NAME);

        const accessTokenReq = store.get('access_token');
        const homeserverUrlReq = store.get('homeserver_url');
        const deviceIdReq = store.get('device_id');

        let accessToken: string | null = null;
        let homeserverUrl: string | null = null;
        let deviceId: string | null = null;

        accessTokenReq.onsuccess = () => { accessToken = accessTokenReq.result || null; };
        homeserverUrlReq.onsuccess = () => { homeserverUrl = homeserverUrlReq.result || null; };
        deviceIdReq.onsuccess = () => { deviceId = deviceIdReq.result || null; };

        transaction.oncomplete = () => resolve({ accessToken, homeserverUrl, deviceId });
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * Settings Storage Functions
 */
export async function saveSwSettings(settings: { showContent?: boolean, quietUntil?: number }): Promise<void> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(AUTH_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(AUTH_STORE_NAME);
        if (settings.showContent !== undefined) store.put(settings.showContent, 'show_content');
        if (settings.quietUntil !== undefined) store.put(settings.quietUntil, 'quiet_until');

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
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

/**
 * Share Target Storage Functions
 */

export async function saveShareToIDB(share: { title?: string, text?: string, url?: string, files?: { blob: Blob, name: string, type: string }[] }): Promise<void> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SHARE_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(SHARE_STORE_NAME);
        const request = store.put(share, 'pending-share');

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getPendingShare(): Promise<any | null> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SHARE_STORE_NAME, 'readonly');
        const store = transaction.objectStore(SHARE_STORE_NAME);
        const request = store.get('pending-share');

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

export async function clearPendingShare(): Promise<void> {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SHARE_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(SHARE_STORE_NAME);
        const request = store.delete('pending-share');

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
