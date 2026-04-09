const DB_NAME    = 'tumult-crypto-storage';
const STORE_NAME = 'decrypted_events';
const MAX_CACHED = 200; // prevent unbounded growth

let _db: IDBDatabase | null = null;

async function openDb(): Promise<IDBDatabase> {
    if (_db) return _db;
    return new Promise((resolve, reject) => {
        // Must match the version in sw.js
        const req = indexedDB.open(DB_NAME, 3);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => { _db = req.result; resolve(_db!); };
        req.onerror   = () => reject(req.error);
    });
}

export async function cacheDecryptedEvent(eventId: string, content: object): Promise<void> {
    try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx  = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(content, eventId);

            // Prune oldest entries if over limit
            const countReq = store.count();
            countReq.onsuccess = () => {
                if (countReq.result > MAX_CACHED) {
                    const cursorReq = store.openCursor();
                    let toDelete = countReq.result - MAX_CACHED;
                    cursorReq.onsuccess = () => {
                        const cursor = cursorReq.result;
                        if (cursor && toDelete > 0) {
                            cursor.delete();
                            toDelete--;
                            cursor.continue();
                        }
                    };
                }
            };

            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('[NotificationCache] Failed to cache event:', e);
    }
}
