// Turns any thrown error (incl. ConvexError) into a friendly, user-facing message.
// ConvexError carries a structured `data` payload ({ code, message }); the raw
// `.message` is a developer string like "[CONVEX Q(...)] Uncaught ConvexError: …"
// which we never want to show users.

const CODE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "You don't have permission to do this.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  INVALID_STATE: "This action isn't available right now.",
  INVALID_ARGUMENT: "Please check the details and try again.",
  INSUFFICIENT_STOCK: "There isn't enough stock for this.",
  BRANCH_MISMATCH: "This isn't available for your branch.",
  BRANCH_HAS_USERS: "There are still users assigned to this branch.",
  SESSION_STALE: "Your session changed — please refresh the page.",
  NO_WAREHOUSE: "No warehouse branch is set up. Contact an admin.",
  ALREADY_INACTIVE: "This is already inactive.",
};

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export function friendlyError(
  err: unknown,
  fallback: string = DEFAULT_MESSAGE
): string {
  if (err && typeof err === "object") {
    // ConvexError → structured payload
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
      const code = (data as { code?: unknown }).code;
      if (typeof code === "string" && CODE_MESSAGES[code]) {
        return CODE_MESSAGES[code];
      }
    }
    // A plain Error — only use its message if it isn't the Convex dev string
    const raw = (err as { message?: unknown }).message;
    if (typeof raw === "string" && raw.trim() && !raw.includes("[CONVEX")) {
      return raw;
    }
  }
  return fallback;
}
