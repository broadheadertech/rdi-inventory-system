"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Package,
  MapPin,
  Heart,
  User,
  ChevronRight,
  LogOut,
  ShoppingBag,
  RefreshCw,
  Ruler,
  X,
  Award,
} from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { useSizePreferences } from "@/lib/hooks/useSizePreferences";
import SizeFeedbackSection from "@/components/customer/SizeFeedback";
import { RedBoxWrapped } from "@/components/customer/RedBoxWrapped";

function MySizesSection() {
  const { allPreferences, removePreferredSize } = useSizePreferences();
  const entries = Object.entries(allPreferences);

  if (entries.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Ruler className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-bold uppercase tracking-tight">
          My Sizes
        </h2>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          Your preferred sizes are auto-selected when browsing products.
        </p>
        <div className="flex flex-wrap gap-2">
          {entries.map(([category, size]) => (
            <span
              key={category}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-sm"
            >
              <span className="font-medium">{category}:</span>
              <span className="text-muted-foreground">{size}</span>
              <button
                onClick={() => removePreferredSize(category)}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label={`Remove ${category} size preference`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BuyAgainSection() {
  const products = useQuery(api.storefront.orders.getBuyAgainProducts, {});
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!products || products.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-bold uppercase tracking-tight">
          Buy Again
        </h2>
        <Link
          href="/account/buy-again"
          className="ml-auto text-xs font-medium text-primary hover:underline"
        >
          See All
        </Link>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
      >
        {products.slice(0, 6).map((product) => (
          <Link
            key={product.styleId}
            href={`/browse/style/${product.styleId}`}
            className="group flex-shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-card"
            style={{ width: 160 }}
          >
            <div className="relative aspect-[3/4] w-full bg-secondary">
              {product.primaryImageUrl ? (
                <Image
                  src={product.primaryImageUrl}
                  alt={product.name}
                  fill
                  sizes="160px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <div className="p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {product.brandName}
              </p>
              <p className="mt-0.5 text-sm font-medium leading-tight line-clamp-2">
                {product.name}
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-primary">
                {formatPrice(product.basePriceCentavos)}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                <RefreshCw className="h-3 w-3" />
                Buy Again
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const profile = useQuery(api.storefront.customers.getMyProfile);
  const ensureProfile = useMutation(api.storefront.customers.ensureCustomerProfile);
  const orders = useQuery(api.storefront.orders.getMyOrders, {});
  const { signOut, user } = useClerk();
  const router = useRouter();

  // Auto-create customer profile on first visit
  useEffect(() => {
    if (profile === null && user) {
      ensureProfile().catch(() => {});
    }
  }, [profile, user, ensureProfile]);

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <User className="h-16 w-16 text-muted-foreground" />
        <h1 className="font-display text-xl font-bold">Sign in to your account</h1>
        <Link
          href="/sign-in"
          className="mt-2 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const activeOrders = orders?.filter((o) =>
    ["pending", "paid", "processing", "shipped"].includes(o.status)
  ) ?? [];

  const menuItems = [
    {
      href: "/account/orders",
      icon: Package,
      label: "My Orders",
      desc: activeOrders.length > 0
        ? `${activeOrders.length} active order${activeOrders.length !== 1 ? "s" : ""}`
        : "View order history",
    },
    {
      href: "/account/addresses",
      icon: MapPin,
      label: "Addresses",
      desc: "Manage delivery addresses",
    },
    {
      href: "/account/wishlist",
      icon: Heart,
      label: "Wishlist",
      desc: "Your saved items",
    },
    {
      href: "/account/buy-again",
      icon: RefreshCw,
      label: "Buy Again",
      desc: "Reorder past purchases",
    },
    {
      href: "/account/loyalty",
      icon: Award,
      label: "Loyalty",
      desc: "Points, tiers & rewards",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Profile header */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          {user.imageUrl ? (
            <img
              src={user.imageUrl}
              alt=""
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <User className="h-7 w-7" />
          )}
        </div>
        <div>
          <h1 className="text-lg font-bold">
            {user.firstName ?? ""} {user.lastName ?? ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {user.primaryEmailAddress?.emailAddress}
          </p>
        </div>
      </div>

      {/* Active orders summary */}
      {activeOrders.length > 0 && (
        <Link
          href="/account/orders"
          className="mt-6 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
        >
          <ShoppingBag className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Track your deliveries
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      {/* Menu */}
      <div className="mt-6 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted"
          >
            <item.icon className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* RedBox Wrapped */}
      <div className="mt-8">
        <RedBoxWrapped />
      </div>

      {/* My Sizes */}
      <MySizesSection />

      {/* Size Feedback */}
      <SizeFeedbackSection />

      {/* Buy Again */}
      <BuyAgainSection />

      {/* Sign out */}
      <button
        onClick={() => signOut(() => router.push("/browse"))}
        className="mt-8 flex w-full items-center gap-3 rounded-lg p-3 text-sm text-destructive hover:bg-destructive/5"
      >
        <LogOut className="h-5 w-5" />
        Sign Out
      </button>
    </div>
  );
}
