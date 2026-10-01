"use client";

// components/pos/DeclareAssistant.tsx — who is making this sale, declared first.
//
// The associate used to be picked while taking payment, after everything was
// punched and the queue was waiting — the worst moment to ask, and optional, so
// sales went out attributed to nobody in particular. An attributed sale is an
// incentive paid, so it is settled before the first item is scanned.
//
// It is a dropdown of this branch's approved associates and nothing else: there
// is no box to type a number into, so a sale cannot be credited to a code
// somebody invented. Each name carries its UID, because two people can share a
// name and a UID is what tells them apart.
//
// A sale nobody served is a real case, so it is declared too, rather than left
// blank and indistinguishable from "not asked yet".

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePOSCart } from "@/components/providers/POSCartProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserCheck, UserX, X } from "lucide-react";

export function DeclareAssistant({ className }: { className?: string }) {
  const {
    fashionAssistantId,
    fashionAssistantName,
    noFashionAssistant,
    setFashionAssistant,
    setNoFashionAssistant,
  } = usePOSCart();
  const roster = useQuery(api.pos.fashionAssistants.listActive);

  const reset = () => setNoFashionAssistant(false);

  // Settled one way or the other: a quiet line, with a way back.
  if (fashionAssistantId || noFashionAssistant) {
    const credited = fashionAssistantId !== null;
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
          credited
            ? "border-emerald-500/30 bg-emerald-50/60"
            : "border-muted bg-muted/40",
          className
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm">
          {credited ? (
            <UserCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <UserX className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "truncate",
              credited ? "font-medium text-emerald-900" : "text-muted-foreground"
            )}
          >
            {credited ? fashionAssistantName : "No associate for this sale"}
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={cn("shrink-0", credited && "text-emerald-800")}
          onClick={reset}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Change
        </Button>
      </div>
    );
  }

  const empty = roster !== undefined && roster.length === 0;

  return (
    <div className={cn("rounded-lg border border-amber-400/50 bg-amber-50/60 p-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="declare-assistant"
          className="text-sm font-semibold text-amber-900"
        >
          Fashion assistant
        </label>

        <select
          id="declare-assistant"
          className="h-10 min-w-[220px] flex-1 rounded-md border bg-background px-3 text-sm"
          value=""
          disabled={roster === undefined || empty}
          onChange={(e) => {
            const fa = roster?.find((row) => String(row._id) === e.target.value);
            if (!fa) return;
            setFashionAssistant(
              String(fa._id),
              fa.uid ? `${fa.name} · ${fa.uid}` : fa.name
            );
          }}
        >
          <option value="" disabled>
            {roster === undefined
              ? "Loading…"
              : empty
                ? "No approved associates at this branch"
                : "Select who is making this sale…"}
          </option>
          {(roster ?? []).map((fa) => (
            <option key={String(fa._id)} value={String(fa._id)}>
              {fa.uid ? `${fa.uid} — ${fa.name}` : fa.name}
            </option>
          ))}
        </select>

        <Button variant="outline" size="sm" onClick={() => setNoFashionAssistant(true)}>
          <UserX className="mr-1.5 h-3.5 w-3.5" />
          No associate
        </Button>
      </div>

      <p className="mt-2 text-xs text-amber-800">
        {empty
          ? "HQ approves associates in Marketing → Fashion Assistants. Until then, sell with “No associate”."
          : "Pick the associate, or mark the sale as having none. Nothing can be added to the cart until this is set."}
      </p>
    </div>
  );
}
