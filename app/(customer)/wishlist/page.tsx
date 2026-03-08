"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation } from "convex/react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Heart, ShoppingBag, LogIn, Share2 } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { toast } from "sonner";

export default function WishlistPage() {
  const { isSignedIn, isLoaded } = useUser();
  const wishlist = useQuery(api.storefront.wishlist.getMyWishlist);
  const removeItem = useMutation(api.storefront.wishlist.removeFromWishlist);
  const addToCart = useMutation(api.storefront.cart.addToCart);
  const generateShareLink = useMutation(
    api.storefront.wishlist.generateShareLink
  );

  const handleShare = async () => {
    try {
      const { token } = await generateShareLink();
      const shareUrl = `${window.location.origin}/wishlist/shared/${token}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    } catch {
      toast.error("Failed to generate share link");
    }
  };

  // Sign-in prompt for guests
  if (isLoaded && !isSignedIn) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <div className="mx-auto max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <Heart className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 font-display text-xl font-bold">
            Sign in to save your favorites
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create an account or sign in to save items to your wishlist and
            access them from any device.
          </p>
          <SignInButton mode="modal">
            <button className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
          </SignInButton>
          <Link
            href="/browse"
            className="mt-3 block text-sm text-muted-foreground hover:text-foreground"
          >
            Continue browsing
          </Link>
        </div>
      </div>
    );
  }

  // Loading skeleton
  if (wishlist === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-2xl font-bold uppercase">
            My Wishlist
          </h1>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border bg-card p-2"
            >
              <div className="aspect-[3/4] animate-pulse rounded bg-muted" />
              <div className="space-y-1.5 p-1">
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-8 w-full animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (wishlist.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold uppercase">
          My Wishlist
        </h1>
        <div className="mt-16 flex flex-col items-center gap-3">
          <Heart className="h-16 w-16 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold">
            Your wishlist is empty
          </h2>
          <p className="text-sm text-muted-foreground">
            Save your favorite items to come back to them later.
          </p>
          <Link
            href="/browse"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold uppercase">
          My Wishlist{" "}
          <span className="text-lg font-normal text-muted-foreground">
            ({wishlist.length} {wishlist.length === 1 ? "item" : "items"})
          </span>
        </h1>
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {wishlist.map((item) => (
          <div
            key={item._id}
            className="group relative overflow-hidden rounded-lg border border-border bg-card"
          >
            {/* Heart remove button */}
            <button
              onClick={async () => {
                try {
                  await removeItem({
                    wishlistItemId: item._id as Id<"wishlists">,
                  });
                  toast.success("Removed from wishlist");
                } catch {
                  toast.error("Failed to remove from wishlist");
                }
              }}
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm transition-transform hover:scale-110"
              aria-label="Remove from wishlist"
            >
              <Heart className="h-4 w-4 fill-red-500 text-red-500" />
            </button>

            {/* Product image */}
            <Link
              href={`/browse/style/${item.styleId}`}
              className="relative block aspect-[3/4] w-full bg-secondary"
            >
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.styleName}
                  fill
                  sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover"
                />
              ) : item.brandLogoUrl ? (
                <Image
                  src={item.brandLogoUrl}
                  alt={item.brandName}
                  fill
                  sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-contain p-6"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Heart className="h-8 w-8" />
                </div>
              )}
              {item.totalStock === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="rounded bg-white px-3 py-1 text-xs font-bold text-black">
                    OUT OF STOCK
                  </span>
                </div>
              )}
            </Link>

            {/* Product details */}
            <div className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {item.brandName}
              </p>
              <Link
                href={`/browse/style/${item.styleId}`}
                className="text-sm font-medium leading-tight line-clamp-2 hover:text-primary"
              >
                {item.styleName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {item.color} / {item.size}
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-primary">
                {formatPrice(item.priceCentavos)}
              </p>

              {/* Stock status */}
              {item.totalStock > 0 && item.totalStock <= 5 && (
                <p className="mt-1 text-[11px] text-amber-600">
                  Only {item.totalStock} left
                </p>
              )}
              {item.totalStock > 5 && (
                <p className="mt-1 text-[11px] text-green-600 dark:text-green-500">
                  In Stock
                </p>
              )}

              {/* Add to Cart button */}
              <button
                disabled={item.totalStock === 0}
                onClick={async () => {
                  try {
                    await addToCart({
                      variantId: item.variantId as Id<"variants">,
                    });
                    toast.success("Added to bag!");
                  } catch {
                    toast.error("Failed to add to bag");
                  }
                }}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors",
                  item.totalStock > 0
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed bg-muted text-muted-foreground"
                )}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                {item.totalStock > 0 ? "Add to Bag" : "Out of Stock"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
