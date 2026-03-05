import { Store } from '@tauri-apps/plugin-store';
import { Client, Stronghold } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';

// Singleton promises to prevent race conditions during concurrent initialization
let _storePromise: Promise<Store> | null = null;
let _strongholdPromise: Promise<Client | null> | null = null;

// Non-sensitive persistent storage (replaces localStorage for prefs)
export async function getTauriStore(): Promise<Store> {
    if (_storePromise) return _storePromise;

    _storePromise = (async () => {
        console.log('[TauriStorage] Initializing Tauri Store...');
        const store = await Store.load('ruby-prefs.json', { autoSave: true, defaults: {} });
        return store;
    })();

    return _storePromise;
}

// Sensitive credential storage (replaces localStorage for tokens)
export async function getStrongholdClient(): Promise<Client | null> {
    if (_strongholdPromise) return _strongholdPromise;

    _strongholdPromise = (async () => {
        try {
            console.log('[TauriStorage] Initializing Stronghold...');
            const appData = await appDataDir();
            const vaultPath = `${appData}/ruby-vault.hold`;

            // Derive stronghold password from a machine-specific value
            // so the user never has to enter one manually.
            // Use the device's hostname + app name as entropy.
            const { hostname } = await import('@tauri-apps/plugin-os');
            const host = (await hostname()) || 'ruby-chat-default-host';
            const password = `ruby-chat-vault-v1-${host}`;

            const stronghold = await Stronghold.load(vaultPath, password);
            let client: Client;

            try {
                client = await stronghold.loadClient('matrix-credentials');
                console.log('[TauriStorage] Stronghold client loaded successfully');
            } catch (err) {
                console.log('[TauriStorage] Client not found, creating new matrix-credentials client');
                client = await stronghold.createClient('matrix-credentials');
            }
            return client;
        } catch (e) {
            console.warn('[TauriStorage] Stronghold initialization failed:', e);
            return null;
        }
    })();

    return _strongholdPromise;
}

export default defineNuxtPlugin(async () => {
    // Pre-initialise both on app start so first reads aren't slow
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        await getTauriStore().catch(console.warn);
        await getStrongholdClient().catch(console.warn);
    }
});
