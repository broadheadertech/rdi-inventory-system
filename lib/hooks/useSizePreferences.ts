"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "rb-size-prefs";

type SizePrefs = Record<string, string>;

// ---------------------------------------------------------------------------
// Tiny pub/sub so every hook instance re-renders when prefs change
// ---------------------------------------------------------------------------
const listeners = new Set<() => void>();
function emitChange() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Read / write helpers (safe for SSR — returns {} when no window)
// ---------------------------------------------------------------------------
function readPrefs(): SizePrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SizePrefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs: SizePrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  emitChange();
}

// Snapshot reference for useSyncExternalStore — must be referentially stable
// when the underlying data hasn't changed.
let cachedJson = "";
let cachedPrefs: SizePrefs = {};

function getSnapshot(): SizePrefs {
  const json = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) ?? "{}" : "{}";
  if (json !== cachedJson) {
    cachedJson = json;
    try {
      cachedPrefs = JSON.parse(json) as SizePrefs;
    } catch {
      cachedPrefs = {};
    }
  }
  return cachedPrefs;
}

function getServerSnapshot(): SizePrefs {
  return {};
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSizePreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const getPreferredSize = useCallback(
    (category: string): string | null => {
      return prefs[category] ?? null;
    },
    [prefs],
  );

  const savePreferredSize = useCallback(
    (category: string, size: string) => {
      const current = readPrefs();
      current[category] = size;
      writePrefs(current);
    },
    [],
  );

  const removePreferredSize = useCallback(
    (category: string) => {
      const current = readPrefs();
      delete current[category];
      writePrefs(current);
    },
    [],
  );

  const allPreferences = prefs;

  return {
    getPreferredSize,
    savePreferredSize,
    removePreferredSize,
    allPreferences,
  } as const;
}
