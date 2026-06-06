"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye } from "lucide-react";

export function ViewAsBranchPicker() {
  const branches = useQuery(api.warehouse.movements.listMovementBranches);
  const start = useMutation(api.auth.impersonation.startViewingAsBranch);
  const router = useRouter();
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleGo() {
    if (!branchId) return;
    setBusy(true);
    try {
      await start({ branchId: branchId as never });
      router.push("/branch/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border bg-white p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Eye className="h-3 w-3" /> View as Branch
      </div>
      <div className="flex gap-1.5">
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="h-8 flex-1 rounded border border-input bg-transparent px-2 text-xs"
        >
          <option value="">Select branch…</option>
          {branches?.map((b) => (
            <option key={b._id as string} value={b._id as string}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleGo}
          disabled={!branchId || busy}
          className="rounded bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "…" : "Go"}
        </button>
      </div>
    </div>
  );
}
