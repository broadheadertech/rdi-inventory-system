"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function DeliverySkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="animate-pulse h-5 w-1/3 rounded bg-muted" />
        <div className="animate-pulse mt-2 h-4 w-1/4 rounded bg-muted" />
      </header>
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg border bg-card p-4">
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
            <div className="mt-2 h-4 w-1/4 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <p className="text-lg font-medium">No deliveries assigned</p>
      <p className="mt-2 text-sm text-muted-foreground">Check back later.</p>
    </div>
  );
}

// ─── Delivery List View ──────────────────────────────────────────────────────

function DeliveryList({
  deliveries,
  onSelect,
}: {
  deliveries: {
    _id: Id<"transfers">;
    toBranchName: string;
    toBranchAddress: string;
    itemCount: number;
    driverArrivedAt: number | null;
    createdAt: number;
  }[];
  onSelect: (id: Id<"transfers">) => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <h1 className="text-lg font-semibold">My Deliveries</h1>
        <p className="text-sm text-muted-foreground">
          {deliveries.length} active{" "}
          {deliveries.length === 1 ? "delivery" : "deliveries"}
        </p>
      </header>

      <div className="space-y-3 p-4">
        {deliveries.map((delivery) => (
          <button
            key={delivery._id}
            type="button"
            onClick={() => onSelect(delivery._id)}
            className="w-full min-h-[48px] rounded-lg border bg-card p-4 text-left active:bg-accent transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{delivery.toBranchName}</p>
                <p className="mt-1 text-sm text-muted-foreground truncate">
                  {delivery.itemCount}{" "}
                  {delivery.itemCount === 1 ? "item" : "items"}
                </p>
              </div>
              {delivery.driverArrivedAt ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Arrived
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  In Transit
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Delivery Detail View ────────────────────────────────────────────────────

function DeliveryDetail({
  transferId,
  onBack,
}: {
  transferId: Id<"transfers">;
  onBack: () => void;
}) {
  const detail = useQuery(api.logistics.deliveries.getDeliveryDetail, {
    transferId,
  });
  const markArrivedMut = useMutation(api.logistics.deliveries.markArrived);
  const confirmDeliveryMut = useMutation(
    api.logistics.deliveries.driverConfirmDelivery
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading delivery...</p>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b bg-background px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] rounded-lg px-3 py-2 text-sm font-medium active:bg-accent"
          >
            ← Back
          </button>
        </header>
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-muted-foreground">Delivery not found or already completed.</p>
        </div>
      </div>
    );
  }

  function handleNavigate() {
    if (!detail) return;
    const url =
      detail.toBranchLatitude && detail.toBranchLongitude
        ? `https://www.google.com/maps/dir/?api=1&destination=${detail.toBranchLatitude},${detail.toBranchLongitude}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detail.toBranchAddress)}`;
    window.open(url, "_blank");
  }

  function handleMarkArrived() {
    setSubmitting(true);
    setError(null);
    markArrivedMut({ transferId }).then(
      () => {
        setSubmitting(false);
      },
      (err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to mark arrived — try again."
        );
        setSubmitting(false);
      }
    );
  }

  function handleConfirmDelivery() {
    setSubmitting(true);
    setError(null);
    confirmDeliveryMut({ transferId }).then(
      () => {
        onBack();
      },
      (err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Delivery failed — try again."
        );
        setSubmitting(false);
      }
    );
  }

  const hasArrived = detail.driverArrivedAt !== null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header with back button */}
      <header className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] min-w-[48px] rounded-lg px-3 py-2 text-sm font-medium active:bg-accent"
        >
          ← Back to list
        </button>
      </header>

      {/* Delivery info */}
      <div className="flex-1 space-y-4 p-4">
        {/* Destination */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Destination
          </p>
          <p className="mt-1 text-lg font-semibold">{detail.toBranchName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.toBranchAddress}
          </p>
        </div>

        {/* Transfer info */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Transfer Details
          </p>
          <div className="mt-2 space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">From:</span>{" "}
              {detail.fromBranchName}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Items:</span>{" "}
              {detail.itemCount} {detail.itemCount === 1 ? "item" : "items"}
            </p>
            <p className="text-sm font-mono text-muted-foreground">
              ID: {detail.transferId.slice(-8)}
            </p>
          </div>
        </div>

        {/* Items list */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Items
          </p>
          <div className="mt-2 divide-y">
            {detail.items.map((item, idx) => (
              <div key={idx} className="py-2 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">{item.styleName}</p>
                <p className="text-xs text-muted-foreground">
                  {[item.size, item.color].filter(Boolean).join(" · ")} — Qty:{" "}
                  {item.packedQuantity}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Status indicator */}
        {hasArrived && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">
              Arrived at destination
            </p>
            <p className="text-xs text-amber-600">
              Ready to hand off to branch staff
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Bottom CTA — fixed to bottom */}
      <div className="sticky bottom-0 border-t bg-background p-4 space-y-2">
        {!hasArrived ? (
          <>
            <button
              type="button"
              onClick={handleNavigate}
              className="w-full h-14 rounded-lg bg-primary text-primary-foreground text-base font-semibold active:opacity-90 disabled:opacity-50"
            >
              Navigate
            </button>
            <button
              type="button"
              onClick={handleMarkArrived}
              disabled={submitting}
              className="w-full h-14 rounded-lg border-2 border-primary text-primary text-base font-semibold active:bg-accent disabled:opacity-50"
            >
              {submitting ? "Updating..." : "I've Arrived"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleConfirmDelivery}
            disabled={submitting}
            className="w-full h-14 rounded-lg bg-green-600 text-white text-base font-semibold active:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Confirming..." : "Confirm Delivery"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DriverDeliveriesPage() {
  const deliveries = useQuery(api.logistics.deliveries.listMyDeliveries);
  const [selectedId, setSelectedId] = useState<Id<"transfers"> | null>(null);

  // Loading state
  if (deliveries === undefined) {
    return <DeliverySkeleton />;
  }

  // Detail view when a delivery is selected
  if (selectedId) {
    return (
      <DeliveryDetail
        transferId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  // Empty state
  if (deliveries.length === 0) {
    return <EmptyState />;
  }

  // List view
  return <DeliveryList deliveries={deliveries} onSelect={setSelectedId} />;
}
