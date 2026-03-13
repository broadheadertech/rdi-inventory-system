"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Database, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _api = api as any;

type SeedResult = {
  branches: { created: number; total: number };
  products: { created: number; skipped: number; total: number };
  inventory: { variants: number; branches: number; estimatedRows: number };
};

type ReseedResult = {
  cleared: number;
  promotions: number;
  transactions: number;
  transactionItems: number;
  inventoryBatches: number;
  cashierShifts: number;
  transfers: number;
  transferItems: number;
  crossSellEvents: number;
};

export default function SeedPage() {
  const seedDatabase = useAction(api.seed.seedDatabase);
  const richReseed = useAction(_api.seedReset.richReseed);

  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [activeAction, setActiveAction] = useState<"seed" | "reseed" | null>(null);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [reseedResult, setReseedResult] = useState<ReseedResult | null>(null);
  const [error, setError] = useState<string>("");

  const handleSeed = async () => {
    setStatus("running");
    setActiveAction("seed");
    setSeedResult(null);
    setReseedResult(null);
    setError("");
    try {
      const res = await seedDatabase();
      setSeedResult(res as SeedResult);
      setStatus("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const handleReseed = async () => {
    setStatus("running");
    setActiveAction("reseed");
    setSeedResult(null);
    setReseedResult(null);
    setError("");
    try {
      const res = await richReseed();
      setReseedResult(res as ReseedResult);
      setStatus("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const isRunning = status === "running";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seed Database</h1>
        <p className="text-sm text-muted-foreground">
          Manage test data for the Redbox Apparel demo environment.
        </p>
      </div>

      {/* Step 1: Seed catalog/branches/inventory */}
      <div className="rounded-lg border p-4 space-y-3">
        <div>
          <p className="font-medium text-sm">Step 1 — Seed Catalog</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Populates branches, brands, categories, styles, variants, and inventory.
            Safe to run multiple times — uses find-or-create.
          </p>
        </div>
        <Button
          onClick={handleSeed}
          disabled={isRunning}
          size="lg"
          className="w-full"
        >
          {isRunning && activeAction === "seed" ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Seeding catalog...</>
          ) : (
            <><Database className="mr-2 h-4 w-4" />Seed Database</>
          )}
        </Button>
      </div>

      <Separator />

      {/* Step 2: Rich reseed transactional data */}
      <div className="rounded-lg border p-4 space-y-3">
        <div>
          <p className="font-medium text-sm">Step 2 — Rich Reseed (Transactional Data)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clears all transactional data (keeps catalog, colors, sizes, settings, images)
            then seeds 60 days of transactions, promotions, cashier shifts, transfers,
            inventory batches, and cross-sell events.
          </p>
        </div>
        <Button
          onClick={handleReseed}
          disabled={isRunning}
          variant="outline"
          size="lg"
          className="w-full"
        >
          {isRunning && activeAction === "reseed" ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reseeding... (may take 1-2 minutes)</>
          ) : (
            <><RefreshCw className="mr-2 h-4 w-4" />Rich Reseed</>
          )}
        </Button>
      </div>

      {/* Results */}
      {status === "done" && seedResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle2 className="h-5 w-5" />
            Seed Complete
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Branches:</span>
            <span>{seedResult.branches.created} created / {seedResult.branches.total} total</span>
            <span className="text-muted-foreground">Products:</span>
            <span>{seedResult.products.created} created, {seedResult.products.skipped} skipped</span>
            <span className="text-muted-foreground">Inventory rows:</span>
            <span>~{seedResult.inventory.estimatedRows} across {seedResult.inventory.branches} branches</span>
          </div>
        </div>
      )}

      {status === "done" && reseedResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle2 className="h-5 w-5" />
            Rich Reseed Complete
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Rows cleared:</span>
            <span>{reseedResult.cleared.toLocaleString()}</span>
            <span className="text-muted-foreground">Promotions:</span>
            <span>{reseedResult.promotions}</span>
            <span className="text-muted-foreground">Transactions:</span>
            <span>{reseedResult.transactions.toLocaleString()}</span>
            <span className="text-muted-foreground">Transaction items:</span>
            <span>{reseedResult.transactionItems.toLocaleString()}</span>
            <span className="text-muted-foreground">Inventory batches:</span>
            <span>{reseedResult.inventoryBatches}</span>
            <span className="text-muted-foreground">Cashier shifts:</span>
            <span>{reseedResult.cashierShifts}</span>
            <span className="text-muted-foreground">Transfers:</span>
            <span>{reseedResult.transfers}</span>
            <span className="text-muted-foreground">Cross-sell events:</span>
            <span>{reseedResult.crossSellEvents}</span>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700 font-medium">
            <AlertCircle className="h-5 w-5" />
            Error
          </div>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
