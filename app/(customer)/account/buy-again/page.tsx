"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, RefreshCw, ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/utils";

export default function BuyAgainPage() {
  const products = useQuery(api.storefront.orders.getBuyAgainProducts, {});

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/account"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Account
      </Link>

      <h1 className="mt-4 font-display text-2xl font-bold uppercase">
        Buy Again
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Products from your previous orders
      </p>

      {/* Loading */}
      {products === undefined && (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-2">
              <div className="aspect-[3/4] animate-pulse rounded bg-muted" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {products !== undefined && products.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <RefreshCw className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No purchase history yet
          </p>
          <p className="text-xs text-muted-foreground">
            Products from your delivered orders will appear here
          </p>
          <Link
            href="/browse"
            className="mt-2 text-sm text-primary hover:underline"
          >
            Start shopping
          </Link>
        </div>
      )}

      {/* Product grid */}
      {products && products.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {products.map((product) => (
            <Link
              key={product.styleId}
              href={`/browse/style/${product.styleId}`}
              className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
            >
              <div className="relative aspect-[3/4] w-full bg-secondary">
                {product.primaryImageUrl ? (
                  <Image
                    src={product.primaryImageUrl}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {product.brandName}
                </p>
                <p className="mt-0.5 text-sm font-medium leading-tight line-clamp-2">
                  {product.name}
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-primary">
                  {formatPrice(product.basePriceCentavos)}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                  <RefreshCw className="h-3 w-3" />
                  Buy Again
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
