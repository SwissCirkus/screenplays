/**
 * A tiny async key-value store: IndexedDB in the browser, a Map in tests.
 *
 * The browser library (web-storage.ts) keeps every project, script, version
 * and asset under string keys here; driveSync.ts mirrors them to Google Drive.
 * Values are structured-cloneable (objects, strings, Blobs).
 */

export interface KvStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every key that starts with `prefix`, in key order. */
  keys(prefix: string): Promise<string[]>;
}

export function createMemoryKv(): KvStore {
  const map = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return map.get(key) as T | undefined; },
    async put(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async keys(prefix) { return [...map.keys()].filter((k) => k.startsWith(prefix)).sort(); },
  };
}

const DB_NAME = 'screenplays-library';
const STORE = 'kv';

export async function createIndexedDbKv(): Promise<KvStore> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // Ask the browser not to evict the library under storage pressure.
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }

  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

  return {
    get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
    put: async (key, value) => { await run('readwrite', (s) => s.put(value, key)); },
    delete: async (key) => { await run('readwrite', (s) => s.delete(key)); },
    keys: async (prefix) => {
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      const all = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys(range));
      return (all as string[]).sort();
    },
  };
}
