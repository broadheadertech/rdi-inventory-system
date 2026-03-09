"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BarChart3, Truck, AlertTriangle, Clock } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";

function SummaryCard({
  icon: Icon,
  label,
  value,
  subValue,
  comparison,
  variant = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  comparison?: { label: string; direction: "up" | "down" | "neutral" };
  variant?: "default" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
        variant === "warning" && "border-yellow-200 bg-yellow-50/50",
        variant === "danger" && "border-red-200 bg-red-50/50"
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            variant === "default" && "bg-primary/10 text-primary",
            variant === "warning" && "bg-yellow-100 text-yellow-700",
            variant === "danger" && "bg-red-100 text-red-700"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {subValue && (
        <p className="mt-1 text-sm text-muted-foreground">{subValue}</p>
      )}
      {comparison && (
        <p
          className={cn(
            "mt-2 text-xs font-medium",
            comparison.direction === "up" && "text-green-600",
            comparison.direction === "down" && "text-red-600",
            comparison.direction === "neutral" && "text-muted-foreground"
          )}
        >
          {comparison.direction === "up" && "▲ "}
          {comparison.direction === "down" && "▼ "}
          {comparison.label}
        </p>
      )}
    </div>
  );
}

function getSalesComparison(
  todayTotal: number,
  yesterdayTotal: number
): { label: string; direction: "up" | "down" | "neutral" } {
  if (yesterdayTotal === 0) {
    return todayTotal > 0
      ? { label: "No sales yesterday", direction: "up" }
      : { label: "No sales yesterday", direction: "neutral" };
  }
  const pctChange = ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100;
  const rounded = Math.abs(Math.round(pctChange));
  if (pctChange > 0) {
    return { label: `${rounded}% vs yesterday`, direction: "up" };
  }
  if (pctChange < 0) {
    return { label: `${rounded}% vs yesterday`, direction: "down" };
  }
  return { label: "Same as yesterday", direction: "neutral" };
}

export default function CommandCenterPage() {
  const summary = useQuery(api.analytics.commandCenter.getDailySummary);

  if (summary === undefined) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Morning Command Center
          </h1>
          <p className="text-muted-foreground">Loading daily summary...</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border bg-gray-100"
            />
          ))}
        </div>
      </div>
    );
  }

  if (summary === null) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Morning Command Center
          </h1>
          <p className="text-muted-foreground">
            No branch assigned. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const salesComparison = getSalesComparison(
    summary.todaySales.totalCentavos,
    summary.yesterdaySales.totalCentavos
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Morning Command Center
        </h1>
        <p className="text-muted-foreground">
          Daily summary &mdash;{" "}
          {new Date().toLocaleDateString("en-PH", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={BarChart3}
          label="Today's Sales"
          value={formatPrice(summary.todaySales.totalCentavos)}
          subValue={`${summary.todaySales.count} transaction${summary.todaySales.count !== 1 ? "s" : ""}`}
          comparison={salesComparison}
        />

        <SummaryCard
          icon={Truck}
          label="Pending Transfers"
          value={String(summary.pendingTransfers)}
          subValue="Incoming shipments"
          variant={summary.pendingTransfers > 0 ? "warning" : "default"}
        />

        <SummaryCard
          icon={AlertTriangle}
          label="Low Stock Alert"
          value={String(summary.lowStockCount)}
          subValue="Items below 5 units"
          variant={
            summary.lowStockCount > 10
              ? "danger"
              : summary.lowStockCount > 0
                ? "warning"
                : "default"
          }
        />

        <SummaryCard
          icon={Clock}
          label="Pending Reservations"
          value={String(summary.pendingReservations)}
          subValue="Awaiting fulfillment"
          variant={summary.pendingReservations > 5 ? "warning" : "default"}
        />
      </div>
    </div>
  );
}
