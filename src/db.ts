/** Minimal IndexedDB wrapper: a key-value store plus a recordings store. */
const DB_NAME = 'englishlab';
const DB_VER = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('rec')) db.createObjectStore('rec');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
export function resetDbHandle() { dbp = null; }

async function tx<T>(store: 'kv' | 'rec', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export const kvGet = <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, val: unknown) => tx('kv', 'readwrite', (s) => s.put(val, key)).then(() => undefined);
export const kvDel = (key: string) => tx('kv', 'readwrite', (s) => s.delete(key)).then(() => undefined);
export const recGet = (id: string) => tx<Blob | undefined>('rec', 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);
export const recPut = (id: string, blob: Blob) => tx('rec', 'readwrite', (s) => s.put(blob, id)).then(() => undefined);
export async function kvAll(): Promise<Record<string, unknown>> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out: Record<string, unknown> = {};
    const t = db.transaction('kv', 'readonly');
    const c = t.objectStore('kv').openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (cur) { out[String(cur.key)] = cur.value; cur.continue(); } else resolve(out);
    };
    c.onerror = () => reject(c.error);
  });
}
