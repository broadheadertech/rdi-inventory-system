"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPrice } from "@/lib/utils";
import { MapPin, Users, ShoppingBag, TrendingUp } from "lucide-react";

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-5 animate-pulse space-y-3">
      <div className="h-5 w-2/3 bg-muted rounded" />
      <div className="h-4 w-1/2 bg-muted rounded" />
      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded" />
      </div>
      <div className="h-12 bg-muted rounded mt-2" />
    </div>
  );
}

export default function ExpansionIntelPage() {
  const insights = useQuery(api.analytics.expansionIntel.getExpansionInsights);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold">Expansion Intelligence</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Identify high-demand areas for new branches
        </p>
      </div>

      {/* Loading */}
      {insights === undefined && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty */}
      {insights !== undefined && insights.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold">No expansion opportunities yet</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md">
            Areas need at least 3 orders with no existing branch to appear here.
            As more online orders come in, hotspots will surface.
          </p>
        </div>
      )}

      {/* Results */}
      {insights && insights.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((area, idx) => (
            <div
              key={`${area.city}-${area.province}`}
              className="rounded-lg border bg-card p-5 space-y-3 hover:shadow-md transition-shadow"
            >
              {/* Rank + Location */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-base">
                    <span className="text-muted-foreground mr-1.5">
                      #{idx + 1}
                    </span>
                    {area.city}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {area.province}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  No branch yet
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <ShoppingBag className="h-3 w-3" />
                    Orders
                  </div>
                  <p className="font-semibold">{area.orderCount}</p>
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Users className="h-3 w-3" />
                    Customers
                  </div>
                  <p className="font-semibold">{area.uniqueCustomers}</p>
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <div className="text-muted-foreground text-xs">Sales</div>
                  <p className="font-semibold">
                    {formatPrice(area.totalRevenueCentavos)}
                  </p>
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <div className="text-muted-foreground text-xs">Avg Order</div>
                  <p className="font-semibold">
                    {formatPrice(area.avgOrderValueCentavos)}
                  </p>
                </div>
              </div>

              {/* Estimated monthly revenue */}
              <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2">
                <div className="flex items-center gap-1 text-xs text-red-600">
                  <TrendingUp className="h-3 w-3" />
                  Est. Monthly Sales
                </div>
                <p className="font-bold text-red-600 text-lg">
                  {formatPrice(area.estimatedMonthlyRevenueCentavos)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
