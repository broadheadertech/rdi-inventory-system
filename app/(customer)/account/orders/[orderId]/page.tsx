"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, Package, Truck, CheckCircle2, XCircle, Clock, RotateCcw } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_STEPS = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "paid", label: "Paid", icon: CheckCircle2 },
  { key: "processing", label: "Processing", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
];

function getStatusIndex(status: string) {
  if (status === "cancelled" || status === "returned" || status === "refunded") return -1;
  return STATUS_STEPS.findIndex((s) => s.key === status);
}

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const order = useQuery(api.storefront.orders.getOrderDetail, {
    orderId: orderId as Id<"orders">,
  });
  const cancelOrder = useMutation(api.storefront.orders.cancelOrder);

  if (order === undefined) {
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

  const currentStep = getStatusIndex(order.status);
  const isCancelled = ["cancelled", "returned", "refunded"].includes(order.status);
  const canCancel = ["pending", "paid", "processing"].includes(order.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        My Orders
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">{order.orderNumber}</h1>
        <span className="text-xs text-muted-foreground">
          {new Date(order.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Status timeline */}
      {!isCancelled && (
        <div className="mt-6 flex items-center justify-between">
          {STATUS_STEPS.map((step, i) => (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    i <= currentStep
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <step.icon className="h-4 w-4" />
                </div>
                <span className="mt-1 text-[10px] text-muted-foreground">{step.label}</span>
              </div>
              {i < STATUS_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1",
                    i < currentStep ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {isCancelled && (
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-destructive/10 p-3">
          <XCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">
              Order {order.status}
            </p>
            {order.cancelReason && (
              <p className="text-xs text-muted-foreground">{order.cancelReason}</p>
            )}
          </div>
        </div>
      )}

      {/* Shipment tracking */}
      {order.shipment && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Shipment
          </p>
          <p className="mt-1 text-sm">
            {order.shipment.carrier}
            {order.shipment.trackingNumber && (
              <span className="ml-2 font-mono text-primary">
                {order.shipment.trackingNumber}
              </span>
            )}
          </p>
          {order.shipment.estimatedDelivery && (
            <p className="text-xs text-muted-foreground">
              Est. delivery: {new Date(order.shipment.estimatedDelivery).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Order items */}
      <div className="mt-6 space-y-3">
        {order.items.map((item) => (
          <div key={item._id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className="relative h-16 w-13 flex-shrink-0 overflow-hidden rounded bg-muted">
              {item.imageUrl && (
                <Image
                  src={item.imageUrl}
                  alt={item.styleName}
                  fill
                  sizes="52px"
                  className="object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{item.styleName}</p>
              <p className="text-xs text-muted-foreground">
                {item.color} / {item.size} x{item.quantity}
              </p>
            </div>
            <span className="font-mono text-sm">{formatPrice(item.lineTotalCentavos)}</span>
          </div>
        ))}
      </div>

      {/* Price breakdown */}
      <div className="mt-6 rounded-lg border border-border p-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPrice(order.subtotalCentavos)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span>
              {order.shippingFeeCentavos === 0 ? "FREE" : formatPrice(order.shippingFeeCentavos)}
            </span>
          </div>
          {order.discountAmountCentavos > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-{formatPrice(order.discountAmountCentavos)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>Total</span>
            <span className="font-mono text-primary">{formatPrice(order.totalCentavos)}</span>
          </div>
        </div>
      </div>

      {/* Delivery address */}
      {order.shippingAddress && (
        <div className="mt-4 rounded-lg border border-border p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Delivery Address
          </p>
          <p className="mt-1 text-sm font-medium">{order.shippingAddress.recipientName}</p>
          <p className="text-xs text-muted-foreground">
            {order.shippingAddress.addressLine1}
            {order.shippingAddress.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {order.shippingAddress.city}, {order.shippingAddress.province}{" "}
            {order.shippingAddress.postalCode}
          </p>
          <p className="text-xs text-muted-foreground">{order.shippingAddress.phone}</p>
        </div>
      )}

      {/* Request Return button */}
      {order.status === "delivered" && (
        <Link
          href={`/account/orders/${order._id}/return`}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-primary py-3 text-sm font-medium text-primary hover:bg-primary/5"
        >
          <RotateCcw className="h-4 w-4" />
          Request Return
        </Link>
      )}

      {/* Cancel button */}
      {canCancel && (
        <button
          onClick={async () => {
            try {
              await cancelOrder({ orderId: order._id });
              toast.success("Order cancelled");
            } catch {
              toast.error("Failed to cancel order");
            }
          }}
          className="mt-6 w-full rounded-md border border-destructive py-3 text-sm font-medium text-destructive hover:bg-destructive/5"
        >
          Cancel Order
        </button>
      )}
    </div>
  );
}
