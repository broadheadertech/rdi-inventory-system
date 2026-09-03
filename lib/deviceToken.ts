// POS device binding — the register's half of the terminal enrollment pair.
//
// The token is a 256-bit secret issued once by `pos.terminalsActions.enrollTerminal`
// and persisted here. It never leaves this device except as an argument to
// Convex over TLS, and Convex never returns it again after enrollment.
//
// localStorage (not sessionStorage) is deliberate: the binding must survive
// browser restarts and power cuts so a register keeps working after a reboot
// without a manager re-enrolling it.

const STORAGE_KEY = "redbox.pos.deviceToken";

/** Reads the enrolled device token, or null on an unenrolled device. */
export function getDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = window.localStorage.getItem(STORAGE_KEY);
    return token && token.length > 0 ? token : null;
  } catch {
    // Private mode or blocked site data — treat as unenrolled.
    return null;
  }
}

/** Persists the token issued at enrollment. Returns false if storage is unavailable. */
export function setDeviceToken(token: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** Clears the binding — used when the server reports the token is stale or revoked. */
export function clearDeviceToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — an unreadable store is already effectively cleared.
  }
}
