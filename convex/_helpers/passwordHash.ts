"use node";
// Password hashing for cashier sub-accounts.
//
// Node-only — import this exclusively from files carrying the "use node"
// directive (convex/**/**Actions.ts).
//
// History: accounts created before this module used a single unsalted-round
// SHA-256 ("sha256" algo), which a GPU brute-forces in seconds. New hashes use
// PBKDF2-SHA512. Legacy hashes still verify, and `verifyPassword` reports when
// the caller should transparently re-hash on a successful login.

import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

export const CURRENT_ALGO = "pbkdf2-sha512-210000" as const;
export const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Legacy scheme — verification only, never for new hashes. */
function legacyHash(password: string, salt: string): string {
  return createHash("sha256").update(salt + password).digest("hex");
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
}

/** Constant-time compare of two hex digests; false on any length mismatch. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type VerifyResult = {
  valid: boolean;
  /** True when the stored hash used a superseded algorithm and should be upgraded. */
  needsRehash: boolean;
};

/**
 * Verifies a password against a stored hash.
 *
 * @param algo - The stored `passwordAlgo`; undefined means a pre-migration
 *               legacy SHA-256 record.
 */
export function verifyPassword(
  password: string,
  salt: string,
  storedHash: string,
  algo: string | undefined
): VerifyResult {
  if (algo === CURRENT_ALGO) {
    return { valid: safeEqualHex(hashPassword(password, salt), storedHash), needsRehash: false };
  }
  // Legacy (algo undefined or "sha256")
  const valid = safeEqualHex(legacyHash(password, salt), storedHash);
  return { valid, needsRehash: valid };
}
