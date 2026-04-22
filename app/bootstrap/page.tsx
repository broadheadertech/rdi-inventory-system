"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";

export default function BootstrapPage() {
  const syncClerkUsers = useAction(api.auth.users.syncClerkUsers);
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [result, setResult] = useState<{ synced: number; updated: number; skipped: number; total: number } | null>(null);
  const [error, setError] = useState<string>("");

  const handleSync = async () => {
    setStatus("syncing");
    setError("");
    try {
      const res = await syncClerkUsers();
      setResult(res);
      setStatus("done");
    } catch (err) {
      const e = err as { data?: { message?: string }; message?: string };
      setError(e?.data?.message ?? e?.message ?? "Sync failed");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto p-8 space-y-6 text-center">
        <h1 className="text-2xl font-bold">Bootstrap Users</h1>
        <p className="text-sm text-muted-foreground">
          This syncs all existing Clerk users into the Convex database.
          It only works without admin auth when the users table is empty.
        </p>

        {status === "idle" && (
          <Button onClick={handleSync} size="lg" className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Users from Clerk
          </Button>
        )}

        {status === "syncing" && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Syncing users from Clerk...</span>
          </div>
        )}

        {status === "done" && result && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">Sync Complete!</span>
            </div>
            <div className="text-sm space-y-1">
              <p><strong>{result.synced}</strong> users added</p>
              <p><strong>{result.updated}</strong> users updated</p>
              <p><strong>{result.skipped}</strong> unchanged</p>
              <p className="text-muted-foreground">Total: {result.total}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Now set yourself as <strong>admin</strong> in Clerk Dashboard &gt; Users &gt; your user &gt;
              Public metadata: <code>{`{"role":"admin"}`}</code>, then sign out and back in.
            </p>
            <p className="text-xs text-muted-foreground">
              Or click below to re-sync after updating the role in Clerk:
            </p>
            <Button variant="outline" onClick={handleSync}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-sync
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Sync Failed</span>
            </div>
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={handleSync}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
