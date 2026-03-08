"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Heart } from "lucide-react";
import { formatPrice } from "@/lib/utils";

export default function SharedWishlistPage() {
  const { token } = useParams<{ token: string }>();
  const data = useQuery(api.storefront.wishlist.getSharedWishlist, {
    token: token ?? "",
  });

  // Loading
  if (data === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
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

  // Not found
  if (data === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
        <Heart className="h-16 w-16 text-muted-foreground" />
        <h1 className="font-display text-xl font-bold">
          Wishlist not found
        </h1>
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

  const { ownerFirstName, items } = data;

  // Empty wishlist
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold uppercase">
          {ownerFirstName}&apos;s Wishlist
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold uppercase">
        {ownerFirstName}&apos;s Wishlist{" "}
        <span className="text-lg font-normal text-muted-foreground">
          ({items.length} {items.length === 1 ? "item" : "items"})
        </span>
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={`${item.styleId}-${item.variantId}`}
            href={`/browse/style/${item.styleId}`}
            className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
          >
            {/* Product image */}
            <div className="relative aspect-[3/4] w-full bg-secondary">
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
            </div>

            {/* Product details */}
            <div className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {item.brandName}
              </p>
              <p className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-primary">
                {item.styleName}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.color} / {item.size}
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-primary">
                {formatPrice(item.priceCentavos)}
              </p>
            </div>
          </Link>
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
          friends and family.
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
