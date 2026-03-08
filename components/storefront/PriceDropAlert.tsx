"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface PriceDropAlertProps {
  styleId: Id<"styles">;
}

export function PriceDropAlert({ styleId }: PriceDropAlertProps) {
  const isWatching = useQuery(api.storefront.priceWatch.isWatchingStyle, {
    styleId,
  });
  const toggleWatch = useMutation(api.storefront.priceWatch.togglePriceWatch);
  const [toggling, setToggling] = useState(false);

  // Don't render until we know the watch state
  if (isWatching === undefined) return null;

  const handleToggle = async () => {
    setToggling(true);
    try {
      const result = await toggleWatch({ styleId });
      if (result.watching) {
        toast.success("We'll notify you when the price drops!");
      } else {
        toast("Price drop alert removed");
      }
    } catch {
      toast.error("Please sign in to set price alerts");
    } finally {
      setToggling(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={toggling}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        isWatching
          ? "text-primary"
          : "text-muted-foreground hover:text-primary"
      )}
    >
      {isWatching ? (
        <>
          <BellRing className="h-3.5 w-3.5" />
          Price alerts active
        </>
      ) : (
        <>
          <Bell className="h-3.5 w-3.5" />
          Notify me on price drop
        </>
      )}
    </button>
  );
}
