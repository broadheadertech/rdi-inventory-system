"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  ArrowLeft,
  MapPin,
  Plus,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Loader2,
  Truck,
  LogIn,
  Zap,
  Clock,
  Store,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { formatPrice, cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function addBusinessDays(date: Date, days: number): Date {
  let count = 0;
  const result = new Date(date);
  while (count < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) count++;
  }
  return result;
}

function formatDeliveryRange(start: Date, end: Date): string {
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });
  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(end);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

function formatSingleDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

type DeliveryMethodId = "standard" | "express" | "sameDay";

const DELIVERY_METHODS: Array<{
  id: DeliveryMethodId;
  label: string;
  timeline: string;
  description: string;
  icon: typeof Truck;
  feeCentavos: number;
  freeThresholdCentavos: number | null; // null = never free
}> = [
  {
    id: "standard",
    label: "Standard Delivery",
    timeline: "3-5 business days",
    description: "Regular delivery",
    icon: Truck,
    feeCentavos: 9900,
    freeThresholdCentavos: 99900, // free over P999
  },
  {
    id: "express",
    label: "Express Delivery",
    timeline: "1-2 business days",
    description: "Priority handling",
    icon: Zap,
    feeCentavos: 14900,
    freeThresholdCentavos: null,
  },
  {
    id: "sameDay",
    label: "Same-Day Delivery",
    timeline: "Today",
    description: "From nearest branch",
    icon: Clock,
    feeCentavos: 24900,
    freeThresholdCentavos: null,
  },
];

const PAYMENT_METHODS = [
  { id: "cod" as const, label: "Cash on Delivery", icon: Banknote, desc: "Pay when you receive" },
  { id: "gcash" as const, label: "GCash", icon: Smartphone, desc: "Pay via GCash" },
  { id: "maya" as const, label: "Maya", icon: Smartphone, desc: "Pay via Maya" },
  { id: "card" as const, label: "Credit/Debit Card", icon: CreditCard, desc: "Visa, Mastercard" },
  { id: "bankTransfer" as const, label: "Bank Transfer", icon: CreditCard, desc: "Online banking" },
] as const;

function isSameDayAvailable(): boolean {
  const now = new Date();
  return now.getHours() < 14;
}

function getShippingFee(
  methodId: DeliveryMethodId,
  subtotalCentavos: number
): number {
  const method = DELIVERY_METHODS.find((m) => m.id === methodId)!;
  if (
    method.freeThresholdCentavos !== null &&
    subtotalCentavos >= method.freeThresholdCentavos
  ) {
    return 0;
  }
  return method.feeCentavos;
}

function getDeliveryEstimate(methodId: DeliveryMethodId): {
  label: string;
  range: string;
} {
  const today = new Date();
  switch (methodId) {
    case "standard": {
      const earliest = addBusinessDays(today, 3);
      const latest = addBusinessDays(today, 5);
      return {
        label: "3 to 5 business days",
        range: formatDeliveryRange(earliest, latest),
      };
    }
    case "express": {
      const earliest = addBusinessDays(today, 1);
      const latest = addBusinessDays(today, 2);
      return {
        label: "1 to 2 business days",
        range: formatDeliveryRange(earliest, latest),
      };
    }
    case "sameDay": {
      return {
        label: "Same-day delivery",
        range: formatSingleDate(today),
      };
    }
  }
}

type FulfillmentType = "delivery" | "pickup";

type RetailBranch = {
  _id: Id<"branches">;
  name: string;
  address: string;
  phone: string | null;
  businessHours: { openTime: string; closeTime: string } | null;
};

export default function CheckoutPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const cart = useQuery(api.storefront.cart.getMyCart);
  const addresses = useQuery(api.storefront.addresses.getMyAddresses);
  const retailBranches = useQuery(api.storefront.branches.getRetailBranches);
  const createOrder = useMutation(api.storefront.orders.createOrder);
  const addAddress = useMutation(api.storefront.addresses.addAddress);

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("delivery");
  const [selectedPickupBranchId, setSelectedPickupBranchId] = useState<Id<"branches"> | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<Id<"customerAddresses"> | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<typeof PAYMENT_METHODS[number]["id"]>("cod");
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryMethodId>("standard");
  const [placing, setPlacing] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    label: "Home",
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    province: "",
    postalCode: "",
  });
  const [savingAddress, setSavingAddress] = useState(false);

  const sameDayAvailable = useMemo(() => isSameDayAvailable(), []);

  // Show sign-in wall for guests
  if (isLoaded && !isSignedIn) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <div className="mx-auto max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <LogIn className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 font-display text-xl font-bold">
            Sign in to complete your order
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create an account or sign in to proceed with checkout, track your
            orders, and save your delivery addresses.
          </p>
          <SignInButton mode="modal">
            <button className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
          </SignInButton>
          <Link
            href="/browse"
            className="mt-3 block text-sm text-muted-foreground hover:text-foreground"
          >
            Continue browsing
          </Link>
        </div>
      </div>
    );
  }

  // Auto-select default address
  if (addresses && addresses.length > 0 && !selectedAddressId) {
    const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0];
    setSelectedAddressId(defaultAddr._id);
  }

  if (cart === undefined || addresses === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (cart === null || cart.items.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <p className="text-lg font-medium">Your bag is empty</p>
        <Link href="/browse" className="text-sm text-primary hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  const isPickup = fulfillmentType === "pickup";
  const shippingFee = isPickup ? 0 : getShippingFee(selectedDelivery, cart.totalCentavos);
  const total = cart.totalCentavos + shippingFee;
  const deliveryEstimate = isPickup ? null : getDeliveryEstimate(selectedDelivery);
  const selectedBranch = isPickup && retailBranches
    ? retailBranches.find((b: RetailBranch) => b._id === selectedPickupBranchId) ?? null
    : null;

  const handlePlaceOrder = async () => {
    if (isPickup) {
      if (!selectedPickupBranchId) {
        toast.error("Please select a pickup branch");
        return;
      }
    } else {
      if (!selectedAddressId) {
        toast.error("Please select a delivery address");
        return;
      }
    }
    setPlacing(true);
    try {
      const result = await createOrder({
        ...(isPickup
          ? { fulfillmentType: "pickup" as const, pickupBranchId: selectedPickupBranchId! }
          : { fulfillmentType: "delivery" as const, addressId: selectedAddressId!, deliveryMethod: selectedDelivery }),
        paymentMethod: selectedPayment,
        shippingFeeCentavos: shippingFee,
      });
      toast.success(`Order ${result.orderNumber} placed!`);
      router.push(`/account/orders/${result.orderId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to place order";
      toast.error(message);
    } finally {
      setPlacing(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!addressForm.recipientName || !addressForm.phone || !addressForm.addressLine1 || !addressForm.city || !addressForm.province || !addressForm.postalCode) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSavingAddress(true);
    try {
      const id = await addAddress({
        ...addressForm,
        isDefault: addresses.length === 0,
      });
      setSelectedAddressId(id);
      setShowAddAddress(false);
      setAddressForm({ label: "Home", recipientName: "", phone: "", addressLine1: "", addressLine2: "", city: "", province: "", postalCode: "" });
      toast.success("Address saved");
    } catch {
      toast.error("Failed to save address");
    } finally {
      setSavingAddress(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/cart"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bag
      </Link>

      <h1 className="mt-4 font-display text-2xl font-bold uppercase">Checkout</h1>

      {/* Fulfillment Method Selector */}
      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wider">Fulfillment Method</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={() => setFulfillmentType("delivery")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
              fulfillmentType === "delivery"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground"
            )}
          >
            <Truck className={cn("h-6 w-6", fulfillmentType === "delivery" ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium">Delivery</span>
            <span className="text-xs text-muted-foreground">Ship to your address</span>
          </button>
          <button
            onClick={() => setFulfillmentType("pickup")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
              fulfillmentType === "pickup"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground"
            )}
          >
            <Store className={cn("h-6 w-6", fulfillmentType === "pickup" ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium">Pick Up In-Store</span>
            <span className="text-xs text-muted-foreground">Free — ready in 2-4 hrs</span>
          </button>
        </div>
      </section>

      {/* Pickup Branch Selector (only for pickup) */}
      {isPickup && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
            <Store className="h-4 w-4 text-primary" />
            Select Pickup Branch
          </h2>

          <div className="mt-3 space-y-2">
            {!retailBranches ? (
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
            ) : retailBranches.length === 0 ? (
              <p className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
                No branches available for pickup at this time.
              </p>
            ) : (
              retailBranches.map((branch: RetailBranch) => (
                <button
                  key={branch._id}
                  onClick={() => setSelectedPickupBranchId(branch._id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    selectedPickupBranchId === branch._id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{branch.name}</span>
                    {selectedPickupBranchId === branch._id && (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{branch.address}</p>
                  {branch.phone && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {branch.phone}
                    </p>
                  )}
                  {branch.businessHours && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {branch.businessHours.openTime} - {branch.businessHours.closeTime}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>

          {selectedBranch && (
            <div
              className="mt-4 flex items-start gap-3 rounded-lg border p-4"
              style={{ backgroundColor: "#111111", borderColor: "#2A2A2A" }}
            >
              <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Estimated pickup: Ready in 2-4 hours
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedBranch.name} — {selectedBranch.address}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Delivery Address (only for delivery) */}
      {!isPickup && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
            <MapPin className="h-4 w-4 text-primary" />
            Delivery Address
          </h2>

          <div className="mt-3 space-y-2">
            {addresses.map((addr) => (
              <button
                key={addr._id}
                onClick={() => setSelectedAddressId(addr._id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  selectedAddressId === addr._id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {addr.label}
                  </span>
                  {selectedAddressId === addr._id && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="mt-1 text-sm font-medium">{addr.recipientName}</p>
                <p className="text-xs text-muted-foreground">
                  {addr.addressLine1}
                  {addr.addressLine2 ? `, ${addr.addressLine2}` : ""},{" "}
                  {addr.city}, {addr.province} {addr.postalCode}
                </p>
                <p className="text-xs text-muted-foreground">{addr.phone}</p>
              </button>
            ))}

            <button
              onClick={() => setShowAddAddress(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              Add New Address
            </button>
          </div>
        </section>
      )}

      {/* Delivery Method (only for delivery) */}
      {!isPickup && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
            <Truck className="h-4 w-4 text-primary" />
            Delivery Method
          </h2>

          <div className="mt-3 space-y-2">
            {DELIVERY_METHODS.map((method) => {
              const fee = getShippingFee(method.id, cart.totalCentavos);
              const isSameDay = method.id === "sameDay";
              const disabled = isSameDay && !sameDayAvailable;

              return (
                <button
                  key={method.id}
                  onClick={() => !disabled && setSelectedDelivery(method.id)}
                  disabled={disabled}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    disabled
                      ? "cursor-not-allowed border-border opacity-50"
                      : selectedDelivery === method.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground"
                  )}
                >
                  <method.icon
                    className={cn(
                      "mt-0.5 h-5 w-5 flex-shrink-0",
                      disabled
                        ? "text-muted-foreground"
                        : selectedDelivery === method.id
                          ? "text-primary"
                          : "text-muted-foreground"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{method.label}</p>
                      <span
                        className={cn(
                          "whitespace-nowrap text-sm font-semibold",
                          fee === 0 ? "text-green-400" : "text-foreground"
                        )}
                      >
                        {fee === 0 ? "FREE" : formatPrice(fee)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {method.timeline} — {method.description}
                    </p>
                    {method.id === "standard" &&
                      method.freeThresholdCentavos !== null && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Free for orders over{" "}
                          {formatPrice(method.freeThresholdCentavos)}
                        </p>
                      )}
                    {isSameDay && !sameDayAvailable && (
                      <p className="mt-0.5 text-xs font-medium text-amber-400">
                        Available for orders before 2:00 PM
                      </p>
                    )}
                  </div>
                  {selectedDelivery === method.id && !disabled && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 3: Payment Method */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <CreditCard className="h-4 w-4 text-primary" />
          Payment Method
        </h2>

        <div className="mt-3 space-y-2">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.id}
              onClick={() => setSelectedPayment(method.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 transition-colors",
                selectedPayment === method.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              )}
            >
              <method.icon className="h-5 w-5 text-muted-foreground" />
              <div className="text-left">
                <p className="text-sm font-medium">{method.label}</p>
                <p className="text-xs text-muted-foreground">{method.desc}</p>
              </div>
              {selectedPayment === method.id && (
                <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Delivery Date Estimate (delivery only) */}
      {!isPickup && deliveryEstimate && (
        <section className="mt-8">
          <div
            className="flex items-start gap-3 rounded-lg border p-4"
            style={{ backgroundColor: "#111111", borderColor: "#2A2A2A" }}
          >
            <Truck className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Estimated delivery: {deliveryEstimate.range}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {DELIVERY_METHODS.find((m) => m.id === selectedDelivery)!.label} —{" "}
                {deliveryEstimate.label}
              </p>
              {selectedPayment === "cod" && (
                <p className="mt-1 text-xs font-medium text-amber-400">
                  Pay upon delivery
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Step 4: Order Summary */}
      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider">Order Summary</h2>
        <div className="mt-3 space-y-3">
          {cart.items.map((item) => (
            <div key={item._id} className="flex items-center gap-3">
              <div className="relative h-14 w-11 flex-shrink-0 overflow-hidden rounded bg-muted">
                {item.imageUrl && (
                  <Image
                    src={item.imageUrl}
                    alt={item.styleName}
                    fill
                    sizes="44px"
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
              <span className="font-mono text-sm font-medium">
                {formatPrice(item.lineTotalCentavos)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPrice(cart.totalCentavos)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {isPickup
                ? "Shipping (In-Store Pickup)"
                : `Shipping (${DELIVERY_METHODS.find((m) => m.id === selectedDelivery)!.label})`}
            </span>
            <span className={shippingFee === 0 ? "text-green-400 font-medium" : ""}>
              {shippingFee === 0 ? "FREE" : formatPrice(shippingFee)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>Total</span>
            <span className="font-mono text-primary">{formatPrice(total)}</span>
          </div>
        </div>
      </section>

      {/* Place Order */}
      <button
        onClick={handlePlaceOrder}
        disabled={placing || (isPickup ? !selectedPickupBranchId : !selectedAddressId)}
        className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {placing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Placing Order...
          </>
        ) : (
          `Place Order — ${formatPrice(total)}`
        )}
      </button>

      {/* Add Address Dialog */}
      <Dialog open={showAddAddress} onOpenChange={setShowAddAddress}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Delivery Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Label</Label>
              <Input
                value={addressForm.label}
                onChange={(e) => setAddressForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Home, Office, etc."
              />
            </div>
            <div>
              <Label>Recipient Name *</Label>
              <Input
                value={addressForm.recipientName}
                onChange={(e) => setAddressForm((f) => ({ ...f, recipientName: e.target.value }))}
                placeholder="Juan Dela Cruz"
              />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input
                value={addressForm.phone}
                onChange={(e) => setAddressForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="09XX XXX XXXX"
              />
            </div>
            <div>
              <Label>Address Line 1 *</Label>
              <Input
                value={addressForm.addressLine1}
                onChange={(e) => setAddressForm((f) => ({ ...f, addressLine1: e.target.value }))}
                placeholder="Street, Building, Unit"
              />
            </div>
            <div>
              <Label>Address Line 2</Label>
              <Input
                value={addressForm.addressLine2}
                onChange={(e) => setAddressForm((f) => ({ ...f, addressLine2: e.target.value }))}
                placeholder="Barangay, Subdivision"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>City *</Label>
                <Input
                  value={addressForm.city}
                  onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Makati"
                />
              </div>
              <div>
                <Label>Province *</Label>
                <Input
                  value={addressForm.province}
                  onChange={(e) => setAddressForm((f) => ({ ...f, province: e.target.value }))}
                  placeholder="Metro Manila"
                />
              </div>
            </div>
            <div>
              <Label>Postal Code *</Label>
              <Input
                value={addressForm.postalCode}
                onChange={(e) => setAddressForm((f) => ({ ...f, postalCode: e.target.value }))}
                placeholder="1234"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAddress(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAddress} disabled={savingAddress}>
              {savingAddress ? "Saving..." : "Save Address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
