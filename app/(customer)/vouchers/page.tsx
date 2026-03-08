"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPrice } from "@/lib/utils";
import { toast } from "sonner";
import {
  Ticket,
  Copy,
  Clock,
  ShoppingBag,
  ArrowLeft,
  Percent,
  Tag,
  Gift,
  Zap,
} from "lucide-react";

function PromoIcon({ type }: { type: string }) {
  switch (type) {
    case "percentage":
      return <Percent className="h-6 w-6" />;
    case "fixedAmount":
      return <Tag className="h-6 w-6" />;
    case "buyXGetY":
      return <Gift className="h-6 w-6" />;
    case "tiered":
      return <Zap className="h-6 w-6" />;
    default:
      return <Tag className="h-6 w-6" />;
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Voucher Card ─────────────────────────────────────────────────────────────

function VoucherCard({
  voucher,
}: {
  voucher: {
    _id: Id<"vouchers">;
    maskedCode: string;
    promoName: string;
    promoType: string;
    discountDescription: string;
    percentageValue?: number;
    fixedAmountCentavos?: number;
    minOrderCentavos?: number;
    endDate?: number;
  };
}) {
  const [collecting, setCollecting] = useState(false);
  const [collected, setCollected] = useState(false);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);

  // This query is only activated when collecting is true
  const collectedVoucher = useQuery(
    api.storefront.vouchers.collectVoucher,
    collecting ? { voucherId: voucher._id } : "skip"
  );

  // Handle the collect response
  const handleCollect = () => {
    setCollecting(true);
  };

  // When the query resolves, copy to clipboard
  useEffect(() => {
    if (collecting && collectedVoucher && !collected) {
      const code = collectedVoucher.code;
      setRevealedCode(code);
      setCollected(true);
      navigator.clipboard.writeText(code).then(() => {
        toast.success("Voucher code copied! Use at checkout.");
      }).catch(() => {
        toast.success(`Voucher code: ${code}`);
      });
    }
  }, [collecting, collectedVoucher, collected]);

  return (
    <div
      className="relative overflow-hidden rounded-xl border transition-all hover:border-[#E8192C]/40"
      style={{
        backgroundColor: "#111111",
        borderColor: collected ? "#E8192C" : "#2A2A2A",
      }}
    >
      {/* Dashed cutout effect */}
      <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-6 w-6 rounded-full bg-background" />
      </div>
      <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2">
        <div className="h-6 w-6 rounded-full bg-background" />
      </div>

      <div className="p-5">
        {/* Top section: icon + discount */}
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(232, 25, 44, 0.15)", color: "#E8192C" }}
          >
            <PromoIcon type={voucher.promoType} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-white">{voucher.discountDescription}</p>
            <p className="mt-0.5 text-sm text-neutral-400">{voucher.promoName}</p>
          </div>
        </div>

        {/* Details */}
        <div className="mt-4 flex flex-wrap gap-3">
          {voucher.minOrderCentavos && voucher.minOrderCentavos > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Min. order {formatPrice(voucher.minOrderCentavos)}</span>
            </div>
          )}
          {voucher.endDate && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <Clock className="h-3.5 w-3.5" />
              <span>Expires {formatDate(voucher.endDate)}</span>
            </div>
          )}
        </div>

        {/* Dashed divider */}
        <div
          className="my-4 border-t border-dashed"
          style={{ borderColor: "#2A2A2A" }}
        />

        {/* Code + collect button */}
        <div className="flex items-center justify-between gap-3">
          <div
            className="flex-1 rounded-lg px-4 py-2.5 text-center font-mono text-sm font-bold tracking-widest"
            style={{ backgroundColor: "#1A1A1A", color: collected ? "#E8192C" : "#888" }}
          >
            {revealedCode ?? voucher.maskedCode}
          </div>

          {!collected ? (
            <button
              onClick={handleCollect}
              className="flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "#E8192C" }}
            >
              <Ticket className="h-4 w-4" />
              Collect
            </button>
          ) : (
            <button
              onClick={() => {
                if (revealedCode) {
                  navigator.clipboard.writeText(revealedCode).then(() => {
                    toast.success("Voucher code copied! Use at checkout.");
                  });
                }
              }}
              className="flex h-10 items-center gap-2 rounded-lg border px-5 text-sm font-bold transition-all hover:opacity-90 active:scale-95"
              style={{ borderColor: "#E8192C", color: "#E8192C" }}
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function VouchersPage() {
  const vouchers = useQuery(api.storefront.vouchers.getAvailableVouchers);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/browse"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          style={{ backgroundColor: "#1A1A1A" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-xl font-bold uppercase tracking-tight">
            Voucher Collection
          </h1>
          <p className="text-sm text-muted-foreground">
            Collect voucher codes and use them at checkout
          </p>
        </div>
      </div>

      {/* Loading */}
      {vouchers === undefined && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-xl"
              style={{ backgroundColor: "#111111" }}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {vouchers !== undefined && vouchers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "rgba(232, 25, 44, 0.1)" }}
          >
            <Ticket className="h-8 w-8" style={{ color: "#E8192C" }} />
          </div>
          <h2 className="mt-4 text-lg font-bold">No Vouchers Available</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check back later for new voucher codes and deals.
          </p>
          <Link
            href="/browse"
            className="mt-6 inline-flex h-10 items-center rounded-lg px-6 text-sm font-bold text-white"
            style={{ backgroundColor: "#E8192C" }}
          >
            Continue Shopping
          </Link>
        </div>
      )}

      {/* Voucher grid */}
      {vouchers && vouchers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {vouchers.map((voucher) => (
            <VoucherCard key={voucher._id} voucher={voucher} />
          ))}
        </div>
      )}
    </div>
  );
}
