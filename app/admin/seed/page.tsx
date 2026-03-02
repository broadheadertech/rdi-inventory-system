"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Database, CheckCircle2, AlertCircle } from "lucide-react";

type SeedResult = {
  branches: { created: number; total: number };
  products: { created: number; skipped: number; total: number };
  inventory: { variants: number; branches: number; estimatedRows: number };
};

export default function SeedPage() {
  const seedDatabase = useAction(api.seed.seedDatabase);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string>("");

  const handleSeed = async () => {
    setStatus("running");
    setResult(null);
    setError("");
    try {
      const res = await seedDatabase();
      setResult(res as SeedResult);
      setStatus("done");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seed Database</h1>
        <p className="text-sm text-muted-foreground">
          Populate branches, catalog (brands, categories, styles, variants), and
          inventory with test data. Safe to run multiple times — uses
          find-or-create patterns.
        </p>
      </div>

      <Button
        onClick={handleSeed}
        disabled={status === "running"}
        size="lg"
        className="w-full"
      >
        {status === "running" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Seeding... (this may take a minute)
          </>
        ) : (
          <>
            <Database className="mr-2 h-4 w-4" />
            Seed Database
          </>
        )}
      </Button>

      {status === "done" && result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle2 className="h-5 w-5" />
            Seed Complete
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Branches:</span>
            <span>{result.branches.created} created / {result.branches.total} total</span>
            <span className="text-muted-foreground">Products:</span>
            <span>{result.products.created} created, {result.products.skipped} skipped</span>
            <span className="text-muted-foreground">Inventory rows:</span>
            <span>~{result.inventory.estimatedRows} across {result.inventory.branches} branches</span>
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
