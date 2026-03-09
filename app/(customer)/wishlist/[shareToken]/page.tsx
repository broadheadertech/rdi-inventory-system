"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Heart,
  ShoppingBag,
  Share2,
  LogIn,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { toast } from "sonner";

export default function SharedWishlistPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { isSignedIn } = useUser();
  const data = useQuery(api.storefront.sharedWishlist.getSharedWishlist, {
    shareToken: shareToken ?? "",
  });
  const addToCart = useMutation(api.storefront.cart.addToCart);

  // ── Share handler ──────────────────────────────────────────────────────────
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (data === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border bg-card p-2"
            >
              <div className="aspect-[3/4] animate-pulse rounded bg-muted" />
              <div className="space-y-1.5 p-1">
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Invalid / expired token ────────────────────────────────────────────────
  if (data === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
        <Heart className="h-16 w-16 text-muted-foreground" />
        <h1 className="font-display text-xl font-bold">Wishlist not found</h1>
        <p className="text-sm text-muted-foreground">
          This wishlist link may be invalid or has expired.
        </p>
        <Link
          href="/browse"
          className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  const { customerName, items } = data;

  // ── Empty wishlist ─────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold uppercase">
          {customerName}&apos;s Wishlist
        </h1>
        <div className="mt-16 flex flex-col items-center gap-3">
          <Heart className="h-16 w-16 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This wishlist is empty.
          </p>
          <Link
            href="/browse"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold uppercase">
          {customerName}&apos;s Wishlist{" "}
          <span className="text-lg font-normal text-muted-foreground">
            ({items.length} {items.length === 1 ? "item" : "items"})
          </span>
        </h1>
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      {/* Product grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={`${item.styleId}-${item.variantId}`}
            className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
          >
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
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Heart className="h-8 w-8" />
                </div>
              )}
              {!item.inStock && (
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

              {/* Stock indicator */}
              <div className="mt-1 flex items-center gap-1">
                {item.inStock ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-500" />
                    <span className="text-[11px] text-green-600 dark:text-green-500">
                      In Stock
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                      Out of Stock
                    </span>
                  </>
                )}
              </div>

              {/* Add to Cart / Sign In */}
              {isSignedIn ? (
                <button
                  disabled={!item.inStock}
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
                    item.inStock
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "cursor-not-allowed bg-muted text-muted-foreground"
                  )}
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  {item.inStock ? "Add to Bag" : "Out of Stock"}
                </button>
              ) : (
                <SignInButton mode="modal">
                  <button className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    <LogIn className="h-3.5 w-3.5" />
                    Sign in to add to bag
                  </button>
                </SignInButton>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-12 flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
        <Heart className="h-10 w-10 text-primary" />
        <h2 className="font-display text-lg font-bold">
          Create your own wishlist
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Sign up or sign in to save your favorite items and share them with
          your barkada.
        </p>
        <Link
          href="/wishlist"
          className="mt-2 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Start Your Wishlist
        </Link>
      </div>
    </div>
  );
}
