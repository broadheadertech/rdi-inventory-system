"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Reusable infinite scroll hook using IntersectionObserver.
 * Attach the returned `sentinelRef` to a DOM element near the bottom of your list.
 * When the sentinel becomes visible and `hasMore && !isLoading`, `callback` fires.
 */
export function useInfiniteScroll(
  callback: () => void,
  hasMore: boolean,
  isLoading: boolean
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const setSentinel = useCallback((node: HTMLDivElement | null) => {
    sentinelRef.current = node;
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoading && hasMore) {
          callbackRef.current();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading]);

  return { sentinelRef: setSentinel };
}
