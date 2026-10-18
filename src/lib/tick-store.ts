import type { Tick } from "@/domain/shopping-list/ticks";
import type { TickStore } from "./tick-sync";

/**
 * The ticks of this device in IndexedDB, where they outlive a closed app and a phone that
 * restarts in the shop. Browser only.
 */

const DATABASE = "essensplan";
const TICKS = "ticks";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(TICKS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function indexedDbTickStore(): TickStore {
  let database: Promise<IDBDatabase> | null = null;
  const db = () => (database ??= open());
  return {
    async read() {
      const transaction = (await db()).transaction(TICKS, "readonly");
      const request = transaction.objectStore(TICKS).getAll();
      await done(transaction);
      return request.result as Tick[];
    },
    // A handful of ticks: written whole, in one transaction, so that a half write cannot be.
    async write(ticks) {
      const transaction = (await db()).transaction(TICKS, "readwrite");
      const store = transaction.objectStore(TICKS);
      store.clear();
      for (const tick of ticks) store.put(tick);
      await done(transaction);
    },
  };
}

/** Forgets the ticks of this device: whoever signs in next starts without them. */
export function clearTickStore(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}
