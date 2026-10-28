"use client";

// A compact "which stores" filter: one button that opens a searchable
// checklist grouped by the brands each store carries. An empty selection
// means all stores.
// Built for lists of 40+ branches, where a row of chips takes over the page.

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type PickerStore = { _id: string; name: string; brandLabel: string };

export function StoreMultiPicker({
  stores,
  picked,
  onChange,
}: {
  stores: PickerStore[];
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byType = new Map<string, PickerStore[]>();
    for (const s of stores) {
      if (needle && !s.name.toLowerCase().includes(needle)) continue;
      const key = s.brandLabel;
      byType.set(key, [...(byType.get(key) ?? []), s]);
    }
    return [...byType].sort(([a], [b]) => a.localeCompare(b));
  }, [stores, query]);

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(picked);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  };

  const label =
    picked.size === 0
      ? "All stores"
      : picked.size === 1
        ? stores.find((s) => picked.has(s._id))?.name ?? "1 store"
        : `${picked.size} stores`;

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Stores</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-7 max-w-[16rem] items-center gap-1.5 rounded-md border bg-background px-2 text-xs",
            picked.size > 0 && "border-primary/60"
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
        {picked.size > 0 && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear store filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-80 rounded-md border bg-popover p-2 shadow-md">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stores..."
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {groups.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No stores match.</p>
            )}
            {groups.map(([type, list]) => {
              const ids = list.map((s) => s._id);
              const allOn = ids.every((id) => picked.has(id));
              return (
                <div key={type} className="mb-1">
                  <div className="flex items-center justify-between px-2 pb-0.5 pt-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {type}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(ids, !allOn)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {allOn ? "Clear" : "Select all"}
                    </button>
                  </div>
                  {list.map((s) => {
                    const on = picked.has(s._id);
                    return (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => toggle([s._id], !on)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                            on && "border-primary bg-primary text-primary-foreground"
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
