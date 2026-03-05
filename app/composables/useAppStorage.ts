import { getTauriStore, getStrongholdClient } from '~/plugins/tauri-storage.client';

const isTauri = () => !!(window as any).__TAURI_INTERNALS__;

// --- Non-sensitive preferences (Tauri Store / localStorage) ---

export async function setPref(key: string, value: any): Promise<void> {
    // ALWAYS mirror to localStorage for maximum reliability as a secondary fallback
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));

    if (isTauri()) {
        const store = await getTauriStore();
        await store.set(key, value);
    }
}

export async function getPref<T>(key: string, fallback: T): Promise<T> {
    let val: any = null;

    if (isTauri()) {
        try {
            const store = await getTauriStore();
            val = await store.get<T>(key);
        } catch (err) {
            console.warn(`[getPref] Tauri store error for ${key}`, err);
        }
    }

    // Fallback to localStorage if Tauri store returned nothing or failed
    if (val === null || val === undefined) {
        const raw = localStorage.getItem(key);
        if (raw !== null && raw !== undefined) {
            try { val = JSON.parse(raw); } catch { val = raw; }
        }
    }

    return (val !== null && val !== undefined) ? (val as T) : fallback;
}

export async function deletePref(key: string): Promise<void> {
    if (isTauri()) {
        const store = await getTauriStore();
        await store.delete(key);
    } else {
        localStorage.removeItem(key);
    }
}

// --- Sensitive credentials (Stronghold / localStorage) ---

export async function setSecret(key: string, value: string): Promise<void> {
    // ALWAYS mirror to localStorage for maximum reliability as a secondary fallback
    localStorage.setItem(key, value);

    if (isTauri()) {
        const client = await getStrongholdClient();
        if (client) {
            const store = client.getStore();
            await store.insert(key, Array.from(new TextEncoder().encode(value)));
        }
    }
}

export async function getSecret(key: string): Promise<string | null> {
    let val: string | null = null;

    if (isTauri()) {
        const client = await getStrongholdClient();
        if (client) {
            try {
                const store = client.getStore();
                const bytes = await store.get(key);
                if (bytes && bytes.length > 0) {
                    val = new TextDecoder().decode(new Uint8Array(bytes));
                }
            } catch (err) {
                console.warn(`[getSecret] Stronghold error for ${key}`, err);
            }
        }
    }

    // Fallback to localStorage if Stronghold returned nothing or failed
    if (!val) {
        val = localStorage.getItem(key);
    }

    return val;
}

export async function deleteSecret(key: string): Promise<void> {
    if (isTauri()) {
        const client = await getStrongholdClient();
        if (client) {
            try {
                const store = client.getStore();
                await store.remove(key);
                return;
            } catch { /* key didn't exist */ }
        }
    }
    localStorage.removeItem(key);
}