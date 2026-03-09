"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, Loader2, ShoppingBag, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

export default function SavedItemsPage() {
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const data = useQuery(api.storefront.savedItems.getMySavedItems, {
    cursor,
    limit: 20,
  });
  const toggleSave = useMutation(api.storefront.savedItems.toggleSaveItem);
  const generateShareLink = useMutation(
    api.storefront.sharedWishlist.generateShareLink
  );
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  async function handleShareWishlist() {
    setSharing(true);
    try {
      const token = await generateShareLink();
      const shareUrl = `${window.location.origin}/wishlist/${token}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Wishlist link copied to clipboard!");
    } catch {
      toast.error("Failed to generate share link");
    }
    setSharing(false);
  }

  async function handleRemove(styleId: Id<"styles">) {
    setRemovingId(styleId);
    try {
      await toggleSave({ styleId });
      toast.success("Removed from wishlist");
    } catch {
      toast.error("Failed to remove");
    }
    setRemovingId(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Heart className="h-5 w-5 text-red-500" />
          <h1 className="text-xl font-bold">Saved Items</h1>
        </div>
        <button
          onClick={handleShareWishlist}
          disabled={sharing}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {sharing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Share Wishlist</span>
        </button>
      </div>

      {data === undefined && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center text-muted-foreground">
          <Heart className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">No saved items yet</p>
          <p className="text-sm mt-1">Heart products you love to save them here</p>
          <Link
            href="/browse"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ShoppingBag className="h-4 w-4" />
            Browse Products
          </Link>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {data.items.map((item) => (
            <div
              key={item._id}
              className="group relative overflow-hidden rounded-lg border border-border bg-card"
            >
              <Link href={`/browse/style/${item.styleId}`}>
                <div className="relative aspect-[3/4] bg-secondary">
                  {item.primaryImageUrl ? (
                    <Image
                      src={item.primaryImageUrl}
                      alt={item.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ShoppingBag className="h-8 w-8 opacity-30" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-sm font-bold text-primary mt-0.5">
                    ₱{(item.basePriceCentavos / 100).toLocaleString()}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => handleRemove(item.styleId)}
                disabled={removingId === item.styleId}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-all hover:bg-black/60"
                aria-label="Remove from wishlist"
              >
                {removingId === item.styleId ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {data?.hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => {
              const last = data.items[data.items.length - 1];
              if (last) setCursor(last.savedAt);
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
