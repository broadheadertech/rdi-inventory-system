"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

interface SaveButtonProps {
  styleId: Id<"styles">;
  className?: string;
}

export function SaveButton({ styleId, className }: SaveButtonProps) {
  const isSaved = useQuery(api.storefront.savedItems.isItemSaved, { styleId });
  const toggleSave = useMutation(api.storefront.savedItems.toggleSaveItem);
  const [loading, setLoading] = useState(false);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const result = await toggleSave({ styleId });
      toast.success(result.saved ? "Saved to wishlist" : "Removed from wishlist");
    } catch {
      // Not logged in or error
    }
    setLoading(false);
  }

  // Don't render if not logged in (query returns false by default)
  if (isSaved === undefined) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-all hover:bg-black/60",
        className
      )}
      aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-white" />
      ) : (
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            isSaved ? "fill-red-500 text-red-500" : "text-white"
          )}
        />
      )}
    </button>
  );
}
