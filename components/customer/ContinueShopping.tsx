"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";

const STORAGE_KEY = "rb-recently-viewed";
const MAX_ITEMS = 12;

export interface RecentlyViewedItem {
  styleId: string;
  name: string;
  brandName: string;
  imageUrl: string | null;
  priceCentavos: number;
  viewedAt: number;
}

/** Read recently viewed items from localStorage. */
export function getRecentlyViewed(): RecentlyViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentlyViewedItem[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

/** Save a viewed item, deduplicating by styleId, keeping max 12 most recent. */
export function saveRecentlyViewed(item: Omit<RecentlyViewedItem, "viewedAt">) {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentlyViewed();
    const filtered = existing.filter((i) => i.styleId !== item.styleId);
    const updated: RecentlyViewedItem[] = [
      { ...item, viewedAt: Date.now() },
      ...filtered,
    ].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function relativeTimeShort(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

export function ContinueShopping() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    setItems(getRecentlyViewed());
  }, []);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener("scroll", checkScroll, { passive: true });
    return () => {
      if (el) el.removeEventListener("scroll", checkScroll);
    };
  }, [items, checkScroll]);

  const scroll = useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -260 : 260, behavior: "smooth" });
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="relative">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-[#E8192C]" />
        <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground">
          Continue Shopping
        </h2>
        <span className="text-xs text-muted-foreground">
          ({items.length} recently viewed)
        </span>
      </div>

      {/* Scroll arrows */}
      {canLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card/90 p-1.5 shadow-md backdrop-blur-sm transition hover:bg-card"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {canRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card/90 p-1.5 shadow-md backdrop-blur-sm transition hover:bg-card"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="scrollbar-hide flex gap-3 overflow-x-auto scroll-smooth pb-2"
      >
        {items.map((item) => (
          <Link
            key={item.styleId}
            href={`/browse/style/${item.styleId}`}
            className={cn(
              "group flex w-[160px] flex-none flex-col overflow-hidden rounded-lg border border-border bg-card",
              "transition-all hover:border-[#E8192C]/40 hover:shadow-[0_0_16px_rgba(232,25,44,0.1)]"
            )}
          >
            {/* Image */}
            <div className="relative aspect-[3/4] w-full bg-secondary">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="160px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Layers className="h-6 w-6" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-1 flex-col gap-0.5 p-2">
              {item.brandName && (
                <p className="font-display text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  {item.brandName}
                </p>
              )}
              <h3 className="text-xs font-medium leading-tight line-clamp-2 text-foreground">
                {item.name}
              </h3>
              <p className="font-mono text-sm font-bold text-primary">
                {formatPrice(item.priceCentavos)}
              </p>
              <p className="mt-auto text-[10px] text-muted-foreground">
                {relativeTimeShort(item.viewedAt)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
