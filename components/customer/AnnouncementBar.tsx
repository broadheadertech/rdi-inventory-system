"use client";

import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const FALLBACK_MESSAGES = [
  "RESERVE NOW, PICK UP TODAY",
  "NEW DROPS EVERY FRIDAY",
  "FREE SHIPPING ON ORDERS ABOVE \u20B12,500",
];

const SEPARATOR = " \u25C6 ";

/**
 * Check if today is within 2 days of the 15th or 30th (Philippine paydays).
 */
function isPaydayWindow(): boolean {
  const today = new Date();
  const day = today.getDate();
  const lastDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();

  // Within 2 days of the 15th: days 13-17
  if (day >= 13 && day <= 17) return true;

  // Within 2 days of the 30th (or last day if month is shorter)
  const anchor = Math.min(30, lastDay);
  if (day >= anchor - 2) return true;
  // Wrap-around: e.g. 30th + 2 days = 1st/2nd of next month
  if (day <= 2) return true;

  return false;
}

const PAYDAY_MESSAGE = "PAYDAY SALE \u2014 Extra deals this week!";

/**
 * Build live ticker messages from homepage data.
 */
function buildTickerMessages(
  homepage: {
    featuredProducts: Array<{
      name: string;
      brandName: string;
      variantCount: number;
    }>;
    promotions: Array<{
      name: string;
      description: string | undefined;
      promoType: string;
      percentageValue?: number;
      fixedAmountCentavos?: number;
    }>;
    categories: Array<{
      name: string;
      count: number;
    }>;
  } | undefined
): string[] {
  if (!homepage) return FALLBACK_MESSAGES;

  const messages: string[] = [];

  // Active promotions
  for (const promo of homepage.promotions) {
    if (promo.promoType === "percentage" && promo.percentageValue) {
      messages.push(`${promo.name} \u2014 ${promo.percentageValue}% OFF`);
    } else if (promo.promoType === "fixed_amount" && promo.fixedAmountCentavos) {
      const amount = (promo.fixedAmountCentavos / 100).toLocaleString();
      messages.push(`${promo.name} \u2014 \u20B1${amount} OFF`);
    } else if (promo.description) {
      messages.push(`${promo.name} \u2014 ${promo.description}`);
    } else {
      messages.push(`${promo.name} \u2014 Live now`);
    }
  }

  // Featured/new arrivals (newest styles)
  const featured = homepage.featuredProducts.slice(0, 6);
  for (let i = 0; i < featured.length; i++) {
    const p = featured[i];
    const label = p.brandName ? `${p.brandName} ${p.name}` : p.name;
    if (i < 2) {
      messages.push(`Just dropped: ${label}`);
    } else if (i < 4) {
      messages.push(`${label} \u2014 trending now`);
    } else {
      messages.push(`${label} \u2014 ${p.variantCount} variants available`);
    }
  }

  // Top categories
  const topCategories = homepage.categories
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  for (const cat of topCategories) {
    messages.push(`${cat.name} \u2014 ${cat.count} styles to explore`);
  }

  // Always include a static message at the end
  messages.push("FREE SHIPPING ON ORDERS ABOVE \u20B12,500");

  return messages.length > 1 ? messages : FALLBACK_MESSAGES;
}

export function AnnouncementBar() {
  const [dismissed, setDismissed] = useState(false);
  const [paydayDismissed, setPaydayDismissed] = useState(false);
  const [isPayday, setIsPayday] = useState(false);

  const homepage = useQuery(api.storefront.homepage.getHomepageData);

  useEffect(() => {
    if (localStorage.getItem("rb-announcement-dismissed") === "1") {
      setDismissed(true);
    }
    if (localStorage.getItem("rb-payday-dismissed") === "1") {
      setPaydayDismissed(true);
    }
    setIsPayday(isPaydayWindow());
  }, []);

  const tickerMessages = useMemo(
    () => buildTickerMessages(homepage ?? undefined),
    [homepage]
  );

  // Build the ticker string: duplicate for seamless loop
  const tickerText = tickerMessages.join(SEPARATOR);
  const fullTicker = tickerText + SEPARATOR + tickerText + SEPARATOR;

  const showPayday = isPayday && !paydayDismissed;

  return (
    <>
      {/* Payday Sale Banner */}
      {showPayday && (
        <div
          className="relative flex items-center overflow-hidden text-white"
          style={{ backgroundColor: "#E8192C" }}
        >
          <div className="animate-marquee flex whitespace-nowrap py-1.5">
            {[PAYDAY_MESSAGE, PAYDAY_MESSAGE, PAYDAY_MESSAGE, PAYDAY_MESSAGE].map(
              (msg, i) => (
                <span
                  key={i}
                  className="font-mono mx-8 text-[11px] font-bold tracking-widest uppercase"
                >
                  {msg}
                </span>
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setPaydayDismissed(true);
              localStorage.setItem("rb-payday-dismissed", "1");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/20"
            aria-label="Dismiss payday sale banner"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Live Ticker */}
      {!dismissed && (
        <div
          className="relative flex items-center overflow-hidden text-white"
          style={{ backgroundColor: "#0A0A0A" }}
        >
          <div className="animate-ticker flex whitespace-nowrap py-1.5">
            <span className="font-mono text-xs font-bold tracking-widest uppercase">
              {fullTicker}
            </span>
            <span className="font-mono text-xs font-bold tracking-widest uppercase">
              {fullTicker}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              localStorage.setItem("rb-announcement-dismissed", "1");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/20 z-10"
            aria-label="Dismiss announcement"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
