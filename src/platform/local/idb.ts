/**
 * IndexedDB mínimo: a "memória local" do app no celular (e no navegador).
 * Guarda projetos, metadados de mídia, os próprios arquivos (Blob) e derivados.
 */
const DB_NAME = 'pn-studio';
const DB_VERSION = 1;
export const STORES = ['projects', 'media', 'blobs', 'derived'] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o armazenamento local.'));
    });
    // pede ao sistema para não apagar os dados do app quando faltar espaço
    void navigator.storage?.persist?.().catch(() => false);
  }
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Erro no armazenamento local.'));
  });
}

async function store(name: StoreName, mode: IDBTransactionMode) {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function idbGet<T>(name: StoreName, key: string): Promise<T | undefined> {
  return wrap((await store(name, 'readonly')).get(key)) as Promise<T | undefined>;
}

export async function idbPut(name: StoreName, key: string, value: unknown): Promise<void> {
  await wrap((await store(name, 'readwrite')).put(value, key));
}

export async function idbDelete(name: StoreName, key: string): Promise<void> {
  await wrap((await store(name, 'readwrite')).delete(key));
}

export async function idbAll<T>(name: StoreName): Promise<T[]> {
  return wrap((await store(name, 'readonly')).getAll()) as Promise<T[]>;
}
