"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";

export default function CartPage() {
  const cart = useQuery(api.storefront.cart.getMyCart);
  const updateQty = useMutation(api.storefront.cart.updateCartItemQuantity);
  const removeItem = useMutation(api.storefront.cart.removeFromCart);
  const clearCart = useMutation(api.storefront.cart.clearCart);

  const handleUpdateQty = async (cartItemId: Id<"cartItems">, newQty: number) => {
    try {
      await updateQty({ cartItemId, quantity: newQty });
    } catch {
      toast.error("Failed to update quantity");
    }
  };

  const handleRemove = async (cartItemId: Id<"cartItems">) => {
    try {
      await removeItem({ cartItemId });
      toast.success("Item removed");
    } catch {
      toast.error("Failed to remove item");
    }
  };

  // Loading
  if (cart === undefined) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold uppercase">Shopping Bag</h1>
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-lg border border-border p-4">
              <div className="h-24 w-20 animate-pulse rounded bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Not logged in
  if (cart === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <ShoppingBag className="h-16 w-16 text-muted-foreground" />
        <h1 className="font-display text-xl font-bold">Sign in to view your bag</h1>
        <p className="text-sm text-muted-foreground">
          Create an account or sign in to start shopping
        </p>
        <Link
          href="/sign-in"
          className="mt-2 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign In
        </Link>
      </div>
    );
  }

  // Empty cart
  if (cart.items.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <ShoppingBag className="h-16 w-16 text-muted-foreground" />
        <h1 className="font-display text-xl font-bold">Your bag is empty</h1>
        <p className="text-sm text-muted-foreground">
          Browse our collection and add items to your bag
        </p>
        <Link
          href="/browse"
          className="mt-2 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Start Shopping
        </Link>
      </div>
    );
  }

  const FREE_SHIPPING_THRESHOLD = 99900; // P999
  const shippingFee = cart.totalCentavos >= FREE_SHIPPING_THRESHOLD ? 0 : 9900;
  const progressPercent = Math.min(
    100,
    Math.round((cart.totalCentavos / FREE_SHIPPING_THRESHOLD) * 100)
  );
  const amountToFreeShipping = FREE_SHIPPING_THRESHOLD - cart.totalCentavos;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase">
          Shopping Bag ({cart.itemCount})
        </h1>
        <button
          onClick={() => clearCart()}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Clear All
        </button>
      </div>

      {/* Free shipping progress */}
      <div className="mt-4 rounded-lg border border-border bg-card p-3">
        {amountToFreeShipping > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Add{" "}
              <span className="font-semibold text-foreground">
                {formatPrice(amountToFreeShipping)}
              </span>{" "}
              more for{" "}
              <span className="font-semibold" style={{ color: "#E8192C" }}>
                FREE shipping!
              </span>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: "#E8192C",
                }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatPrice(cart.totalCentavos)} / {formatPrice(FREE_SHIPPING_THRESHOLD)}
            </p>
          </>
        ) : (
          <p className="text-sm font-semibold text-green-500">
            🎉 You qualify for FREE shipping!
          </p>
        )}
      </div>

      {/* Cart items */}
      <div className="mt-6 space-y-4">
        {cart.items.map((item) => (
          <div
            key={item._id}
            className="flex gap-4 rounded-lg border border-border bg-card p-4"
          >
            {/* Product image */}
            <Link
              href={`/browse/style/${item.styleId}`}
              className="relative h-28 w-22 flex-shrink-0 overflow-hidden rounded bg-muted"
            >
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.styleName}
                  fill
                  sizes="88px"
                  className="object-cover"
                />
              ) : item.brandLogoUrl ? (
                <Image
                  src={item.brandLogoUrl}
                  alt={item.brandName}
                  fill
                  sizes="88px"
                  className="object-contain p-3"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </Link>

            {/* Product info */}
            <div className="flex flex-1 flex-col">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {item.brandName}
                  </p>
                  <Link
                    href={`/browse/style/${item.styleId}`}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {item.styleName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {item.color} / {item.size}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(item._id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-auto flex items-center justify-between pt-2">
                {/* Quantity controls */}
                <div className="flex items-center gap-2 rounded-md border border-border">
                  <button
                    onClick={() => handleUpdateQty(item._id, item.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center hover:bg-muted"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="min-w-[20px] text-center text-sm font-medium">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => handleUpdateQty(item._id, item.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center hover:bg-muted"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Price */}
                <span className="font-mono text-sm font-bold text-primary">
                  {formatPrice(item.lineTotalCentavos)}
                </span>
              </div>

              {/* Low stock warning */}
              {item.totalStock > 0 && item.totalStock <= 5 && (
                <p className="mt-1 text-[11px] text-amber-600">
                  Only {item.totalStock} left in stock
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Order summary */}
      <div className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-sm font-bold uppercase">Order Summary</h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal ({cart.itemCount} items)</span>
            <span>{formatPrice(cart.totalCentavos)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            {shippingFee === 0 ? (
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground line-through">
                  {formatPrice(9900)}
                </span>
                <span className="font-semibold text-green-500">FREE</span>
              </span>
            ) : (
              <span>{formatPrice(shippingFee)}</span>
            )}
          </div>
          <div className="border-t border-border pt-2">
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span className="font-mono text-primary">
                {formatPrice(cart.totalCentavos + shippingFee)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              VAT included
            </p>
          </div>
        </div>

        <Link
          href="/checkout"
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
        >
          Proceed to Checkout
          <ArrowRight className="h-4 w-4" />
        </Link>

        <Link
          href="/browse"
          className="mt-2 flex h-10 w-full items-center justify-center text-sm text-muted-foreground hover:text-foreground"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
