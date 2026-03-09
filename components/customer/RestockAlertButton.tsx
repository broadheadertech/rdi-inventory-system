"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

interface RestockAlertButtonProps {
  variantId: Id<"variants">;
  styleId: Id<"styles">;
  isOutOfStock: boolean;
}

export function RestockAlertButton({
  variantId,
  styleId,
  isOutOfStock,
}: RestockAlertButtonProps) {
  const subscribe = useMutation(api.storefront.restockAlerts.subscribeToRestock);
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  if (!isOutOfStock) return null;

  async function handleSubscribe() {
    if (loading || subscribed) return;
    setLoading(true);
    try {
      const result = await subscribe({ variantId, styleId });
      if (result.alreadySubscribed) {
        toast.info("You're already subscribed to this alert");
      } else {
        toast.success("We'll notify you when this is back in stock!");
      }
      setSubscribed(true);
    } catch {
      toast.error("Failed to set up alert");
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading || subscribed}
      className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : subscribed ? (
        <BellRing className="h-3.5 w-3.5" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      {subscribed ? "Alert Set" : "Notify Me"}
    </button>
  );
}
