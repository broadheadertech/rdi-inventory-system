"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HeroSection } from "@/components/customer/HeroSection";

export default function BrowsePage() {
  const brands = useQuery(api.catalog.publicBrowse.listActiveBrandsPublic);

  return (
    <div>
      {/* Hero Section */}
      <HeroSection />

      {/* Brands Section */}
      <div className="mx-auto max-w-7xl px-4 py-10">
        <h2
          className="font-display text-2xl font-bold uppercase tracking-tight"
        >
          Browse by Brand
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Our collection of premium streetwear brands
        </p>

        {/* Loading skeleton */}
        {brands === undefined && (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-lg border border-border bg-secondary"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {brands !== undefined && brands.length === 0 && (
          <div className="mt-12 text-center">
            <p className="text-muted-foreground">No brands available yet.</p>
          </div>
        )}

        {/* Brand cards grid */}
        {brands !== undefined && brands.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {brands.map((brand) => (
              <Link
                key={brand._id}
                href={`/browse/${brand._id}`}
                className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-4 text-center transition-all hover:border-primary hover:shadow-[0_0_20px_rgba(232,25,44,0.1)]"
              >
                {brand.logo ? (
                  <span className="text-3xl">{brand.logo}</span>
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                    {brand.name.charAt(0)}
                  </span>
                )}
                <span
                  className="font-display text-sm font-bold uppercase tracking-wider text-foreground"
                >
                  {brand.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
