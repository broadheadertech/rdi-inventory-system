"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, CheckCircle2, AlertTriangle, Package } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { toast } from "sonner";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function ReturnRequestPage() {
  const { orderId } = useParams();
  const order = useQuery(api.storefront.orders.getOrderDetail, {
    orderId: orderId as Id<"orders">,
  });
  const reasons = useQuery(api.storefront.returns.getReturnReasons, {});
  const requestReturn = useMutation(api.storefront.returns.requestReturn);

  const [selectedReason, setSelectedReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Loading state
  if (order === undefined || reasons === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // Order not found
  if (!order) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium">Order not found</p>
        <Link href="/account/orders" className="text-sm text-primary hover:underline">
          Back to orders
        </Link>
      </div>
    );
  }

  // Check eligibility
  const isDelivered = order.status === "delivered";
  const deliveredAt = order.shipment?.deliveredAt ?? order.updatedAt;
  const withinWindow = Date.now() - deliveredAt <= SEVEN_DAYS_MS;
  const isEligible = isDelivered && withinWindow;

  // Success state after submission
  if (submitted) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <h1 className="font-display text-2xl font-bold">Return Request Submitted</h1>
          <div className="max-w-md rounded-lg border border-border bg-card p-6 text-left">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Return Instructions
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="font-bold text-foreground">1.</span>
                Please bring the item to your nearest RedBox branch within 7 days.
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-foreground">2.</span>
                Bring your order confirmation (order number: {order.orderNumber}).
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-foreground">3.</span>
                Items must be in original condition with tags attached.
              </li>
            </ul>
          </div>
          <Link
            href="/account/orders"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to My Orders
          </Link>
        </div>
      </div>
    );
  }

  // Ineligible state
  if (!isEligible) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={`/account/orders/${orderId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Order
        </Link>

        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-16 w-16 text-amber-500" />
          <h1 className="font-display text-xl font-bold">Return Not Available</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {!isDelivered
              ? "This order is not eligible for a return because it has not been delivered yet."
              : "The 7-day return window has expired for this order. Returns must be requested within 7 days of delivery."}
          </p>
          <Link
            href={`/account/orders/${orderId}`}
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to Order Details
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!selectedReason) {
      toast.error("Please select a return reason");
      return;
    }

    setSubmitting(true);
    try {
      await requestReturn({
        orderId: order._id,
        reason: selectedReason,
        notes: notes.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit return request";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/account/orders/${orderId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Order
      </Link>

      <h1 className="mt-4 font-display text-2xl font-bold uppercase">
        Request Return
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Order {order.orderNumber}
      </p>

      {/* Order summary */}
      <div className="mt-6 rounded-lg border border-border p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Order Summary
        </p>
        <div className="mt-3 space-y-3">
          {order.items.map((item) => (
            <div key={item._id} className="flex items-center gap-3">
              <div className="relative h-14 w-11 flex-shrink-0 overflow-hidden rounded bg-muted">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.styleName}
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{item.styleName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.color} / {item.size} x{item.quantity}
                </p>
              </div>
              <span className="font-mono text-sm">
                {formatPrice(item.lineTotalCentavos)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm font-bold">
          <span>Total</span>
          <span className="font-mono text-primary">
            {formatPrice(order.totalCentavos)}
          </span>
        </div>
      </div>

      {/* Return reason */}
      <div className="mt-6">
        <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Reason for return <span className="text-destructive">*</span>
        </label>
        <div className="mt-3 space-y-2">
          {reasons.map((reason: string) => (
            <label
              key={reason}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                selectedReason === reason
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <input
                type="radio"
                name="returnReason"
                value={reason}
                checked={selectedReason === reason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">{reason}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Additional notes */}
      <div className="mt-6">
        <label
          htmlFor="return-notes"
          className="text-sm font-bold uppercase tracking-wider text-muted-foreground"
        >
          Additional Notes (optional)
        </label>
        <textarea
          id="return-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any additional details about the return..."
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || !selectedReason}
        className={cn(
          "mt-6 w-full rounded-md py-3 text-sm font-medium transition-colors",
          selectedReason && !submitting
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        )}
      >
        {submitting ? "Submitting..." : "Submit Return Request"}
      </button>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        By submitting, you agree to bring the item to a RedBox branch within 7
        days in its original condition.
      </p>
    </div>
  );
}
