import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ConvexError } from "convex/values";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function relativeTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    // ConvexError payloads come in two shapes in this codebase:
    //   throw new ConvexError("Username already taken")        → data is a string
    //   throw new ConvexError({ code, message })               → data is an object
    // Only the second was handled, so every plain-string error — which is most
    // of the user-facing ones — surfaced as "Unknown error".
    const data = error.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const { message, code } = data as { message?: string; code?: string };
      if (message) return message;
      if (code) return code;
    }
    return "Something went wrong. Please try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
