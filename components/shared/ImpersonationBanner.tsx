"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, X } from "lucide-react";

export function ImpersonationBanner() {
  const viewing = useQuery(api.auth.impersonation.getViewingAsBranch);
  const stop = useMutation(api.auth.impersonation.stopViewingAsBranch);
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  if (!viewing) return null;

  async function handleExit() {
    setExiting(true);
    try {
      await stop({});
      router.push("/admin/branches");
    } finally {
      setExiting(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 shadow-lg">
        <Eye className="h-4 w-4 text-amber-600" />
        <span className="text-sm text-amber-800">
          Viewing as{" "}
          <span className="font-semibold">{viewing.branchName}</span>
        </span>
        <button
          onClick={handleExit}
          disabled={exiting}
          className="flex items-center gap-1 rounded-full bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          {exiting ? "Exiting…" : "Exit"}
        </button>
      </div>
    </div>
  );
}
