"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ShoppingBag } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type Feedback = "runs_small" | "true_to_size" | "runs_large";

const FEEDBACK_OPTIONS: { value: Feedback; label: string }[] = [
  { value: "runs_small", label: "Runs Small" },
  { value: "true_to_size", label: "True to Size" },
  { value: "runs_large", label: "Runs Large" },
];

function SizeFeedbackCard({
  orderId,
  orderNumber,
  styleName,
  imageUrl,
  itemCount,
}: {
  orderId: Id<"orders">;
  orderNumber: string;
  styleName: string;
  imageUrl: string | null;
  itemCount: number;
}) {
  const submitFeedback = useMutation(api.storefront.reviews.submitSizeFeedback);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSelect(feedback: Feedback) {
    if (loading || submitted) return;
    setLoading(true);
    try {
      await submitFeedback({ orderId, sizeFeedback: feedback });
      setSubmitted(true);
    } catch {
      // Silently handle — user can retry
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10">
          <Check className="h-5 w-5 text-green-500" />
        </div>
        <div>
          <p className="text-sm font-medium">Thanks for your feedback!</p>
          <p className="text-xs text-muted-foreground">
            This helps other shoppers find the right size.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {/* Product thumbnail */}
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-secondary">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={styleName}
              fill
              sizes="56px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">
            How did the fit feel?
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {styleName}
            {itemCount > 1 ? ` +${itemCount - 1} more` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            Order {orderNumber}
          </p>
        </div>
      </div>

      {/* Feedback buttons */}
      <div className="mt-3 flex gap-2">
        {FEEDBACK_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            disabled={loading}
            onClick={() => handleSelect(opt.value)}
            className="flex-1 rounded-md border border-border bg-muted/50 px-2 py-2 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SizeFeedbackSection() {
  const orders = useQuery(api.storefront.reviews.getOrdersNeedingSizeFeedback);

  if (!orders || orders.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <svg
          className="h-5 w-5 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 4h-4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
          <path d="M6 10h12" />
          <path d="M12 14v6" />
          <path d="M8 20h8" />
        </svg>
        <h2 className="font-display text-lg font-bold uppercase tracking-tight">
          How Did It Fit?
        </h2>
      </div>
      <div className="space-y-3">
        {orders.map((order) => (
          <SizeFeedbackCard
            key={order.orderId}
            orderId={order.orderId}
            orderNumber={order.orderNumber}
            styleName={order.styleName}
            imageUrl={order.imageUrl}
            itemCount={order.itemCount}
          />
        ))}
      </div>
    </div>
  );
}
