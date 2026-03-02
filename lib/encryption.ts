// lib/encryption.ts — AES-256-GCM encryption via Web Crypto API
// No external libraries — native browser crypto only

const KEY_DB = "pos-keys";
const KEY_STORE = "encryption-keys";
const KEY_ID = "pos-aes-gcm-v1";

let _keyDb: IDBDatabase | null = null;
let _cachedKey: CryptoKey | null = null;

function openKeyDb(): Promise<IDBDatabase> {
  if (_keyDb) return Promise.resolve(_keyDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      _keyDb = req.result;
      resolve(_keyDb);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;

  const db = await openKeyDb();

  // Try to read existing key
  const existing = await new Promise<{ id: string; key: CryptoKey } | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readonly");
      const req = tx.objectStore(KEY_STORE).get(KEY_ID);
      req.onsuccess = () => resolve(req.result as { id: string; key: CryptoKey } | undefined);
      req.onerror = () => reject(req.error);
    }
  );

  if (existing) {
    _cachedKey = existing.key;
    return _cachedKey;
  }

  // Generate new non-extractable AES-GCM-256 key
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable — device-bound
    ["encrypt", "decrypt"]
  );

  // Store CryptoKey directly — Structured Clone algorithm supports CryptoKey objects
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    const req = tx.objectStore(KEY_STORE).put({ id: KEY_ID, key });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  _cachedKey = key;
  return _cachedKey;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns base64-encoded [12-byte IV | ciphertext+GCM-tag].
 * Generates a fresh random IV for every call — never reuses IV.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  // Concatenate IV + ciphertext into single buffer
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  // L1 fix: forEach loop avoids spread into variadic args (stack-safe for all payload sizes)
  let binary = "";
  combined.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/**
 * Decrypt a base64-encoded [IV | ciphertext] string produced by encrypt().
 * Extracts the first 12 bytes as IV, remainder as ciphertext.
 */
export async function decrypt(encoded: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
