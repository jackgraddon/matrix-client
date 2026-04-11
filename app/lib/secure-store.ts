import { isTauri, fromBase64, toBase64 } from '~/utils/base64';

export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

async function getOrCreateStrongholdSecret(): Promise<string> {
  const { LazyStore } = await import('@tauri-apps/plugin-store');
  const store = new LazyStore('preferences.json', { autoSave: false, defaults: {} });

  const existing = await store.get<string>('_stronghold_secret');
  if (existing) return existing;

  const newSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  await store.set('_stronghold_secret', newSecret);
  await store.save();
  return newSecret;
}

async function createStrongholdStore(): Promise<SecureStore> {
  const { Stronghold } = await import('@tauri-apps/plugin-stronghold');
  const { appDataDir } = await import('@tauri-apps/api/path');

  const vaultPath = `${await appDataDir()}/matrix.hold`;
  const secret = await getOrCreateStrongholdSecret();

  const stronghold = await Stronghold.load(vaultPath, secret);
  const client = await stronghold.loadClient('matrix');
  const store = client.getStore();

  return {
    async get(key) {
      const val = await store.get(key);
      return val ? new TextDecoder().decode(new Uint8Array(val)) : null;
    },
    async set(key, value) {
      const bytes = Array.from(new TextEncoder().encode(value));
      await store.insert(key, bytes);
      await stronghold.save();
    },
    async remove(key) {
      await store.remove(key);
      await stronghold.save();
    }
  };
}

function createWebStore(): SecureStore {
  return {
    async get(key) {
      return localStorage.getItem(key);
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
    async remove(key) {
      localStorage.removeItem(key);
    }
  };
}

let _storeInstance: SecureStore | null = null;
let _storeInitPromise: Promise<SecureStore> | null = null;

export async function getSecureStore(): Promise<SecureStore> {
  if (_storeInstance) return _storeInstance;
  if (_storeInitPromise) return _storeInitPromise;

  _storeInitPromise = (async () => {
    if (isTauri) {
      _storeInstance = await createStrongholdStore();
    } else {
      _storeInstance = createWebStore();
    }
    return _storeInstance;
  })();

  return _storeInitPromise;
}
