"use client";

// components/pos/DeclareAssistant.tsx — who is making this sale, declared first.
//
// The associate used to be picked while taking payment, after everything was
// punched and the queue was waiting — the worst moment to ask, and optional, so
// sales went out attributed to nobody. An attributed sale is an incentive paid,
// so it is worth knowing before the first item is scanned rather than guessing
// at the end.
//
// The badge carries a UID that RDI issues on approval, so a scan lands on a
// person. Names are the fallback, and a name on its own is the thing a UID
// exists to stop being trusted.

import { useState } from "react";
import { useQuery, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePOSCart } from "@/components/providers/POSCartProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ScanLine, UserCheck, X } from "lucide-react";

const REFUSALS: Record<string, string> = {
  unknown: "No associate has that number.",
  otherBranch: "That associate belongs to another branch.",
  notApproved: "That associate is still waiting for HQ approval.",
  inactive: "That associate is no longer active.",
};

export function DeclareAssistant({ className }: { className?: string }) {
  const convex = useConvex();
  const { fashionAssistantId, fashionAssistantName, setFashionAssistant } = usePOSCart();
  const roster = useQuery(api.pos.fashionAssistants.listActive);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [showList, setShowList] = useState(false);

  async function declareByUid(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setChecking(true);
    setError(null);
    try {
      const found = await convex.query(api.pos.fashionAssistants.getByUid, { uid: value });
      if (!found || !found.found) {
        setError(REFUSALS[found?.reason ?? "unknown"] ?? REFUSALS.unknown);
        return;
      }
      setFashionAssistant(found._id as string, `${found.name} · ${found.uid}`);
      setCode("");
    } catch {
      setError("That lookup did not work. Try again.");
    } finally {
      setChecking(false);
    }
  }

  // Declared: a quiet line at the top of the till, with a way to change it.
  if (fashionAssistantId) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50/60 px-3 py-2",
          className
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <UserCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="truncate font-medium text-emerald-900">
            {fashionAssistantName}
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-emerald-800"
          onClick={() => {
            setFashionAssistant(null, null);
            setShowList(false);
            setError(null);
          }}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-amber-400/50 bg-amber-50/60 p-4", className)}>
      <div className="mb-2 flex items-center gap-2">
        <ScanLine className="h-4 w-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">
          Declare the fashion assistant
        </h3>
      </div>
      <p className="mb-3 text-xs text-amber-800">
        Scan the badge or type the UID. Nothing can be added to the cart until the sale
        has someone to credit.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input
          autoFocus
          className="max-w-[200px] bg-background font-mono"
          placeholder="FA-0001"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void declareByUid(code);
          }}
          disabled={checking}
        />
        <Button disabled={checking || !code.trim()} onClick={() => void declareByUid(code)}>
          Declare
        </Button>
        <Button variant="outline" onClick={() => setShowList((v) => !v)}>
          {showList ? "Hide list" : "Pick from list"}
        </Button>
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* The fallback, for a badge that will not scan */}
      {showList && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-md border bg-background">
          {roster === undefined ? (
            <p className="p-3 text-xs text-muted-foreground">Loading…</p>
          ) : roster.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              This branch has no approved associates yet. HQ approves them in Marketing.
            </p>
          ) : (
            roster.map((fa) => (
              <button
                key={String(fa._id)}
                type="button"
                onClick={() => {
                  setFashionAssistant(
                    String(fa._id),
                    fa.uid ? `${fa.name} · ${fa.uid}` : fa.name
                  );
                  setShowList(false);
                  setError(null);
                }}
                className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
              >
                <span className="truncate">{fa.name}</span>
                {fa.uid && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {fa.uid}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
