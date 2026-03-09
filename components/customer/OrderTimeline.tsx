"use client";

import {
  Check,
  Clock,
  CreditCard,
  Package,
  Truck,
  MapPin,
  ShoppingBag,
  XCircle,
  RotateCcw,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                      */
/* ──────────────────────────────────────────────────────────────────────────── */

type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded";

interface TimelineStep {
  key: string;
  label: string;
  icon: React.ElementType;
  timestamp?: number | null;
}

interface OrderTimelineProps {
  status: OrderStatus;
  fulfillmentType?: "delivery" | "pickup";
  createdAt: number;
  paidAt?: number | null;
  cancelledAt?: number | null;
  cancelReason?: string | null;
  returnRequestedAt?: number | null;
  returnReason?: string | null;
  shipment?: {
    shippedAt?: number | null;
    deliveredAt?: number | null;
    status?: string;
  } | null;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Step definitions                                                           */
/* ──────────────────────────────────────────────────────────────────────────── */

function getDeliverySteps(props: OrderTimelineProps): TimelineStep[] {
  return [
    { key: "pending", label: "Order Placed", icon: ShoppingBag, timestamp: props.createdAt },
    { key: "paid", label: "Payment Confirmed", icon: CreditCard, timestamp: props.paidAt },
    { key: "processing", label: "Processing", icon: Package, timestamp: null },
    { key: "shipped", label: "Shipped", icon: Truck, timestamp: props.shipment?.shippedAt },
    { key: "delivered", label: "Delivered", icon: MapPin, timestamp: props.shipment?.deliveredAt },
  ];
}

function getPickupSteps(props: OrderTimelineProps): TimelineStep[] {
  return [
    { key: "pending", label: "Order Placed", icon: ShoppingBag, timestamp: props.createdAt },
    { key: "paid", label: "Payment Confirmed", icon: CreditCard, timestamp: props.paidAt },
    { key: "processing", label: "Ready for Pickup", icon: Package, timestamp: null },
    { key: "delivered", label: "Picked Up", icon: Check, timestamp: props.shipment?.deliveredAt },
  ];
}

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

const PICKUP_STATUS_ORDER: Record<string, number> = {
  pending: 0,
  paid: 1,
  processing: 2,
  delivered: 3,
};

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ──────────────────────────────────────────────────────────────────────────── */

function formatTimestamp(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Component                                                                  */
/* ──────────────────────────────────────────────────────────────────────────── */

export function OrderTimeline(props: OrderTimelineProps) {
  const { status, fulfillmentType, cancelledAt, cancelReason, returnRequestedAt, returnReason } =
    props;

  const isTerminal = ["cancelled", "returned", "refunded"].includes(status);
  const isPickup = fulfillmentType === "pickup";
  const steps = isPickup ? getPickupSteps(props) : getDeliverySteps(props);
  const statusMap = isPickup ? PICKUP_STATUS_ORDER : STATUS_ORDER;
  const currentIndex = statusMap[status] ?? -1;

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Order Progress
      </p>

      <div className="relative pl-4">
        {steps.map((step, i) => {
          const isCompleted = !isTerminal && i <= currentIndex;
          const isCurrent = !isTerminal && i === currentIndex;
          const isFuture = isTerminal || i > currentIndex;
          const isLast = i === steps.length - 1;

          return (
            <div key={step.key} className="relative pb-6 last:pb-0">
              {/* Vertical connecting line */}
              {!isLast && (
                <div
                  className={cn(
                    "absolute left-[9px] top-[24px] w-0.5 bottom-0",
                    isCompleted && !isCurrent ? "bg-[#E8192C]" : "bg-muted"
                  )}
                />
              )}

              <div className="flex items-start gap-3">
                {/* Dot */}
                <div className="relative z-10 flex-shrink-0">
                  {isCompleted && !isCurrent ? (
                    /* Completed step */
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E8192C]">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </div>
                  ) : isCurrent ? (
                    /* Current step - pulsing */
                    <div className="relative flex h-5 w-5 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E8192C] opacity-30" />
                      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-[#E8192C]">
                        <step.icon className="h-3 w-3 text-white" strokeWidth={2.5} />
                      </span>
                    </div>
                  ) : (
                    /* Future step */
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                      <step.icon className="h-3 w-3 text-muted-foreground" strokeWidth={2} />
                    </div>
                  )}
                </div>

                {/* Label & timestamp */}
                <div className="min-w-0 pt-px">
                  <p
                    className={cn(
                      "text-sm leading-5",
                      isCompleted ? "font-semibold text-foreground" : "text-muted-foreground",
                      isCurrent && "text-[#E8192C]"
                    )}
                  >
                    {step.label}
                  </p>
                  {isCompleted && step.timestamp ? (
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(step.timestamp)}
                    </p>
                  ) : isFuture ? (
                    <p className="text-[11px] text-muted-foreground/50">Pending</p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {/* Terminal status indicator */}
        {isTerminal && (
          <div className="relative pb-0">
            <div className="flex items-start gap-3">
              <div className="relative z-10 flex-shrink-0">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full",
                    status === "cancelled" || status === "refunded"
                      ? "bg-destructive"
                      : "bg-amber-500"
                  )}
                >
                  {status === "cancelled" ? (
                    <Ban className="h-3 w-3 text-white" strokeWidth={2.5} />
                  ) : status === "refunded" ? (
                    <XCircle className="h-3 w-3 text-white" strokeWidth={2.5} />
                  ) : (
                    <RotateCcw className="h-3 w-3 text-white" strokeWidth={2.5} />
                  )}
                </div>
              </div>

              <div className="min-w-0 pt-px">
                <p className="text-sm font-semibold capitalize text-destructive">
                  {status === "refunded" ? "Refund Issued" : `Order ${status}`}
                </p>
                {status === "cancelled" && cancelledAt && (
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(cancelledAt)}
                  </p>
                )}
                {status === "cancelled" && cancelReason && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{cancelReason}</p>
                )}
                {status === "returned" && returnRequestedAt && (
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(returnRequestedAt)}
                  </p>
                )}
                {status === "returned" && returnReason && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{returnReason}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
