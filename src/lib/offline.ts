import { openDB, type IDBPDatabase } from 'idb';
import type { Backpack, Item } from '@/types';

const DB_NAME = 'plecak-ewakuacyjny-db';
const DB_VERSION = 1;

// Generate UUID - works in HTTP and HTTPS contexts
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface PendingChange {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

interface PlecakDB {
  backpacks: Backpack;
  items: Item;
  pendingChanges: PendingChange;
  syncMeta: { id: string; lastSync: string };
}

let dbInstance: IDBPDatabase<PlecakDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PlecakDB>> {
  if (dbInstance) return dbInstance;
  
  dbInstance = await openDB<PlecakDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('backpacks')) {
        db.createObjectStore('backpacks', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('backpackId', 'backpackId');
      }
      
      if (!db.objectStoreNames.contains('pendingChanges')) {
        db.createObjectStore('pendingChanges', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'id' });
      }
    },
  });
  
  return dbInstance;
}

export async function saveBackpackLocal(backpack: Backpack): Promise<void> {
  const db = await getDB();
  await db.put('backpacks', backpack);
}

export async function getBackpacksLocal(): Promise<Backpack[]> {
  try {
    const db = await getDB();
    return db.getAll('backpacks');
  } catch {
    return [];
  }
}

export async function deleteBackpackLocal(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('backpacks', id);
  const items = await db.getAllFromIndex('items', 'backpackId', id);
  const tx = db.transaction('items', 'readwrite');
  for (const item of items) {
    await tx.store.delete(item.id);
  }
  await tx.done;
}

export async function saveItemLocal(item: Item): Promise<void> {
  const db = await getDB();
  await db.put('items', item);
}

export async function getItemsLocal(backpackId?: string): Promise<Item[]> {
  try {
    const db = await getDB();
    if (backpackId) {
      return db.getAllFromIndex('items', 'backpackId', backpackId);
    }
    return db.getAll('items');
  } catch {
    return [];
  }
}

export async function deleteItemLocal(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('items', id);
}

export async function addPendingChange(type: string, data: Record<string, unknown>): Promise<void> {
  const db = await getDB();
  const change: PendingChange = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    data,
    timestamp: Date.now(),
  };
  await db.put('pendingChanges', change);
}

export async function getPendingChanges(): Promise<PendingChange[]> {
  const db = await getDB();
  return db.getAll('pendingChanges');
}

export async function clearPendingChanges(): Promise<void> {
  const db = await getDB();
  await db.clear('pendingChanges');
}

export async function removePendingChange(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pendingChanges', id);
}

export async function setLastSync(date: Date): Promise<void> {
  const db = await getDB();
  await db.put('syncMeta', { id: 'lastSync', lastSync: date.toISOString() });
}

export async function getLastSync(): Promise<Date | null> {
  const db = await getDB();
  const meta = await db.get('syncMeta', 'lastSync');
  return meta ? new Date(meta.lastSync) : null;
}

export async function saveAllDataLocal(backpacks: Backpack[], items: Item[]): Promise<void> {
  const db = await getDB();
  
  const backpackTx = db.transaction('backpacks', 'readwrite');
  await backpackTx.store.clear();
  for (const backpack of backpacks) {
    await backpackTx.store.put(backpack);
  }
  await backpackTx.done;
  
  const itemTx = db.transaction('items', 'readwrite');
  await itemTx.store.clear();
  for (const item of items) {
    await itemTx.store.put(item);
  }
  await itemTx.done;
}

export async function clearAllDataLocal(): Promise<void> {
  const db = await getDB();
  await db.clear('backpacks');
  await db.clear('items');
  await db.clear('pendingChanges');
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export async function registerBackgroundSync(): Promise<void> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register('sync-data');
  }
}
