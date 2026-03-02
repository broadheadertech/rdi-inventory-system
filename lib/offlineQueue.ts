// lib/offlineQueue.ts — IndexedDB offline queue manager
// Three stores: transactionQueue, offlineCart, stockSnapshot
// Native IDBDatabase API — no external library (consistent with Epic 4 mandate)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueuedTransaction {
  id: string;            // crypto.randomUUID()
  timestamp: number;     // Date.now() at time of queuing
  branchId: string;      // unencrypted for identification
  encryptedPayload: string; // base64 AES-GCM encrypted JSON of CreateTransactionArgs
  retryCount: number;    // starts at 0, not re-queued on failure
}

export interface CreateTransactionArgs {
  items: Array<{
    variantId: string;           // Id<"variants"> serialized as string
    quantity: number;
    unitPriceCentavos: number;
  }>;
  paymentMethod: "cash" | "gcash" | "maya";
  discountType: "senior" | "pwd" | "none";
  amountTenderedCentavos?: number;
}

export interface OfflineCartItem {
  variantId: string;     // Id<"variants"> serialized as string
  styleName: string;
  size: string;
  color: string;
  quantity: number;
  unitPriceCentavos: number;
}

export interface OfflineCartState {
  branchId: string;
  items: OfflineCartItem[];
  discountType: "senior" | "pwd" | "none";
  savedAt: number;
}

// ─── DB Singleton ────────────────────────────────────────────────────────────

// Cache the IDBDatabase at module level — do NOT reopen on every operation
let _db: IDBDatabase | null = null;

export async function openOfflineDb(): Promise<IDBDatabase> {
  if (_db) return _db;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("pos-offline", 1);
    req.onupgradeneeded = (e) => {
      const openedDb = (e.target as IDBOpenDBRequest).result;
      if (!openedDb.objectStoreNames.contains("transactionQueue")) {
        openedDb.createObjectStore("transactionQueue", { keyPath: "id" });
      }
      if (!openedDb.objectStoreNames.contains("offlineCart")) {
        openedDb.createObjectStore("offlineCart", { keyPath: "branchId" });
      }
      if (!openedDb.objectStoreNames.contains("stockSnapshot")) {
        openedDb.createObjectStore("stockSnapshot", { keyPath: "branchId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  _db = db;
  return db;
}

// ─── Transaction Queue Operations ────────────────────────────────────────────

export async function enqueueTransaction(entry: QueuedTransaction): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("transactionQueue", "readwrite");
    const req = tx.objectStore("transactionQueue").put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllTransactions(): Promise<QueuedTransaction[]> {
  const db = await openOfflineDb();
  const all = await new Promise<QueuedTransaction[]>((resolve, reject) => {
    const tx = db.transaction("transactionQueue", "readonly");
    const req = tx.objectStore("transactionQueue").getAll();
    req.onsuccess = () => resolve(req.result as QueuedTransaction[]);
    req.onerror = () => reject(req.error);
  });
  // Sort ascending by timestamp — oldest first for sequential replay
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("transactionQueue", "readwrite");
    const req = tx.objectStore("transactionQueue").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllTransactions(): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("transactionQueue", "readwrite");
    const req = tx.objectStore("transactionQueue").clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const db = await openOfflineDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction("transactionQueue", "readonly");
    const req = tx.objectStore("transactionQueue").count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Cart Persistence Operations ─────────────────────────────────────────────

export async function saveCart(cart: OfflineCartState): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("offlineCart", "readwrite");
    const req = tx.objectStore("offlineCart").put(cart);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getCart(branchId: string): Promise<OfflineCartState | null> {
  const db = await openOfflineDb();
  const result = await new Promise<OfflineCartState | undefined>((resolve, reject) => {
    const tx = db.transaction("offlineCart", "readonly");
    const req = tx.objectStore("offlineCart").get(branchId);
    req.onsuccess = () => resolve(req.result as OfflineCartState | undefined);
    req.onerror = () => reject(req.error);
  });
  return result ?? null;
}

export async function clearCart(branchId: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("offlineCart", "readwrite");
    const req = tx.objectStore("offlineCart").delete(branchId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Stock Snapshot Operations ────────────────────────────────────────────────

export async function saveStockSnapshot(
  branchId: string,
  snapshot: Record<string, number>
): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("stockSnapshot", "readwrite");
    const req = tx.objectStore("stockSnapshot").put({ branchId, snapshot, savedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getStockSnapshot(
  branchId: string
): Promise<Record<string, number> | null> {
  const db = await openOfflineDb();
  const result = await new Promise<
    { branchId: string; snapshot: Record<string, number>; savedAt: number } | undefined
  >((resolve, reject) => {
    const tx = db.transaction("stockSnapshot", "readonly");
    const req = tx.objectStore("stockSnapshot").get(branchId);
    req.onsuccess = () =>
      resolve(
        req.result as
          | { branchId: string; snapshot: Record<string, number>; savedAt: number }
          | undefined
      );
    req.onerror = () => reject(req.error);
  });
  return result?.snapshot ?? null;
}

export async function decrementStockItem(
  branchId: string,
  variantId: string,
  qty: number
): Promise<void> {
  const db = await openOfflineDb();
  // M2 fix: single readwrite transaction for both get and put — atomic read-modify-write
  // (two separate transactions are technically non-atomic; concurrent callers could race)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("stockSnapshot", "readwrite");
    const store = tx.objectStore("stockSnapshot");
    const getReq = store.get(branchId);
    getReq.onsuccess = () => {
      const current = getReq.result as
        | { branchId: string; snapshot: Record<string, number>; savedAt: number }
        | undefined;
      if (!current) {
        resolve(); // No snapshot to decrement
        return;
      }
      const updated = { ...current.snapshot };
      updated[variantId] = Math.max(0, (updated[variantId] ?? 0) - qty);
      const putReq = store.put({ ...current, snapshot: updated });
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function clearStockSnapshot(branchId: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("stockSnapshot", "readwrite");
    const req = tx.objectStore("stockSnapshot").delete(branchId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
