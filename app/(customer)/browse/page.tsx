"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPrice, cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ShoppingBag,
  Zap,
  Tag,
  Percent,
  Gift,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { FlashSaleCountdown } from "@/components/customer/FlashSaleCountdown";
import { StyleQuiz } from "@/components/customer/StyleQuiz";
import { PersonalizedDashboard } from "@/components/customer/PersonalizedDashboard";
import { PaydayBanner } from "@/components/customer/PaydayBanner";
import { StyleDuel } from "@/components/customer/StyleDuel";
import { DailyCheckIn } from "@/components/customer/DailyCheckIn";
import { QuickViewSheet } from "@/components/customer/QuickViewSheet";
import { Id } from "@/convex/_generated/dataModel";

// ─── Horizontal Scroll Helper ────────────────────────────────────────────────
function HScrollRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = ref.current;
    if (el) el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el?.removeEventListener("scroll", checkScroll);
  }, [checkScroll]);

  const scroll = (dir: "left" | "right") => {
    ref.current?.scrollBy({
      left: dir === "left" ? -280 : 280,
      behavior: "smooth",
    });
  };

  return (
    <div className="group/scroll relative">
      {canLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute -left-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-card p-1.5 shadow-md transition-opacity hover:bg-muted lg:block"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div
        ref={ref}
        className={cn(
          "flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory",
          className
        )}
      >
        {children}
      </div>
      {canRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-card p-1.5 shadow-md transition-opacity hover:bg-muted lg:block"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Swipe Hook ──────────────────────────────────────────────────────────────
function useSwipe(onLeft: () => void, onRight: () => void) {
  const touchStart = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart.current === null) return;
      const diff = e.changedTouches[0].clientX - touchStart.current;
      if (Math.abs(diff) > 50) {
        if (diff < 0) onLeft();
        else onRight();
      }
      touchStart.current = null;
    },
    [onLeft, onRight]
  );

  return { onTouchStart, onTouchEnd };
}

// ─── Hero Banner Carousel ────────────────────────────────────────────────────
const FALLBACK_BANNERS = [
  {
    title: "THINK INSIDE THE BOX",
    subtitle: "Premium Streetwear — Reserve Now, Pick Up Today",
    linkUrl: "/browse",
    imageUrl: null as string | null,
  },
  {
    title: "NEW DROPS WEEKLY",
    subtitle: "Be the first to cop the latest streetwear essentials",
    linkUrl: "/browse",
    imageUrl: null as string | null,
  },
  {
    title: "FREE SHIPPING",
    subtitle: "On all orders above ₱999 — no code needed",
    linkUrl: "/browse",
    imageUrl: null as string | null,
  },
];

const HERO_GRADIENTS = [
  "from-primary/20 via-primary/5 to-transparent",
  "from-blue-500/15 via-blue-500/5 to-transparent",
  "from-green-500/15 via-green-500/5 to-transparent",
  "from-purple-500/15 via-purple-500/5 to-transparent",
  "from-amber-500/15 via-amber-500/5 to-transparent",
];

function HeroBannerCarousel({
  dbBanners,
}: {
  dbBanners: {
    _id: string;
    title: string;
    subtitle?: string;
    imageUrl: string | null;
    linkUrl?: string;
  }[];
}) {
  const banners = dbBanners.length > 0 ? dbBanners : FALLBACK_BANNERS;
  const [current, setCurrent] = useState(0);

  const next = useCallback(
    () => setCurrent((c) => (c + 1) % banners.length),
    [banners.length]
  );
  const prev = useCallback(
    () => setCurrent((c) => (c - 1 + banners.length) % banners.length),
    [banners.length]
  );

  const swipe = useSwipe(next, prev);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [banners.length, next]);

  const banner = banners[current];
  const hasImage = !!banner.imageUrl;

  return (
    <section
      className="relative overflow-hidden"
      {...swipe}
    >
      {hasImage ? (
        /* ── Image banner ── */
        <Link href={banner.linkUrl ?? "/browse"} className="relative block aspect-[21/9] sm:aspect-[3/1] w-full">
          <Image
            src={banner.imageUrl!}
            alt={banner.title}
            fill
            sizes="100vw"
            className="object-cover transition-opacity duration-500"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-6 left-0 right-0 px-4 text-center text-white">
            <h2 className="font-display text-xl font-extrabold uppercase tracking-tight sm:text-3xl lg:text-4xl">
              {banner.title}
            </h2>
            {banner.subtitle && (
              <p className="mt-1 text-sm opacity-80 sm:text-base">
                {banner.subtitle}
              </p>
            )}
          </div>
        </Link>
      ) : (
        /* ── Text fallback banner ── */
        <div
          className={cn(
            "flex flex-col items-center justify-center px-4 py-16 text-center transition-all duration-700 lg:py-24",
            `bg-gradient-to-b ${HERO_GRADIENTS[current % HERO_GRADIENTS.length]}`
          )}
        >
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight sm:text-4xl lg:text-6xl">
            {banner.title.split(" ").map((word, i) => (
              <span
                key={i}
                className={
                  ["BOX", "DROPS", "SHIPPING"].includes(word)
                    ? "text-primary"
                    : ""
                }
              >
                {word}{" "}
              </span>
            ))}
          </h1>
          {banner.subtitle && (
            <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
              {banner.subtitle}
            </p>
          )}
          <Link
            href={banner.linkUrl ?? "/browse"}
            className="font-mono mt-6 inline-flex h-11 items-center rounded-md bg-primary px-8 text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            Shop Now
          </Link>
        </div>
      )}

      {/* Navigation arrows (desktop) */}
      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/50 lg:block"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/50 lg:block"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === current
                  ? "w-6 bg-primary"
                  : "w-2 bg-white/50"
              )}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Promo Type Icon ─────────────────────────────────────────────────────────
function PromoIcon({ type }: { type: string }) {
  switch (type) {
    case "percentage":
      return <Percent className="h-5 w-5" />;
    case "fixedAmount":
      return <Tag className="h-5 w-5" />;
    case "buyXGetY":
      return <Gift className="h-5 w-5" />;
    case "tiered":
      return <Zap className="h-5 w-5" />;
    default:
      return <Tag className="h-5 w-5" />;
  }
}

// ─── Hot Deals Mini Carousel ──────────────────────────────────────────────────
const PROMO_GRADIENTS = [
  "from-primary/15 to-primary/5",
  "from-blue-500/15 to-blue-500/5",
  "from-amber-500/15 to-amber-500/5",
  "from-purple-500/15 to-purple-500/5",
  "from-emerald-500/15 to-emerald-500/5",
  "from-pink-500/15 to-pink-500/5",
];

function HotDealsCarousel({
  promotions,
}: {
  promotions: {
    _id: string;
    name: string;
    description?: string;
    promoType: string;
    percentageValue?: number;
    fixedAmountCentavos?: number;
  }[];
}) {
  const [current, setCurrent] = useState(0);

  const next = useCallback(
    () => setCurrent((c) => (c + 1) % promotions.length),
    [promotions.length]
  );
  const prev = useCallback(
    () => setCurrent((c) => (c - 1 + promotions.length) % promotions.length),
    [promotions.length]
  );

  const swipe = useSwipe(next, prev);

  useEffect(() => {
    if (promotions.length <= 1) return;
    const timer = setInterval(next, 4000);
    return () => clearInterval(timer);
  }, [promotions.length, next]);

  const promo = promotions[current];
  const gradient = PROMO_GRADIENTS[current % PROMO_GRADIENTS.length];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r px-5 py-4 transition-all duration-500",
        gradient
      )}
      {...swipe}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-card/80 text-primary backdrop-blur-sm">
          <PromoIcon type={promo.promoType} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              Hot Deal
            </span>
          </div>
          <p className="mt-0.5 truncate text-base font-bold">{promo.name}</p>
          {promo.description && (
            <p className="truncate text-xs text-muted-foreground">
              {promo.description}
            </p>
          )}
        </div>
      </div>

      {/* Dots */}
      {promotions.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {promotions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === current
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-muted-foreground/30"
              )}
              aria-label={`Go to deal ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Gender Tabs ─────────────────────────────────────────────────────────────
const GENDER_TABS = [
  { key: "all", label: "All" },
  { key: "womens", label: "Women" },
  { key: "mens", label: "Men" },
  { key: "kids", label: "Kids" },
] as const;

type GenderKey = (typeof GENDER_TABS)[number]["key"];

// ─── Gender Tab Theme Colors ────────────────────────────────────────────────
// Each gender tab gets a unique color for its pill and brand circles
const GENDER_THEMES: Record<GenderKey, { pill: string; circle: string }> = {
  all: {
    pill: "border-foreground bg-foreground text-background",
    circle: "border-primary bg-primary text-primary-foreground",
  },
  womens: {
    pill: "border-pink-600 bg-pink-600 text-white",
    circle: "border-pink-600 bg-pink-600 text-white",
  },
  mens: {
    pill: "border-blue-600 bg-blue-600 text-white",
    circle: "border-blue-600 bg-blue-600 text-white",
  },
  kids: {
    pill: "border-amber-500 bg-amber-500 text-white",
    circle: "border-amber-500 bg-amber-500 text-white",
  },
};

function matchesGender(genders: string[], selected: GenderKey): boolean {
  if (selected === "all") return true;
  if (genders.includes(selected)) return true;
  if (selected === "kids") {
    // "kids" matches boys, girls, and "kids" (unisex-kids)
    return genders.includes("boys") || genders.includes("girls");
  }
  // For mens/womens: adult "unisex" counts towards both, but NOT for kids
  if (genders.includes("unisex")) return true;
  return false;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function BrowsePage() {
  const data = useQuery(api.storefront.homepage.getHomepageData);
  const [selectedGender, setSelectedGender] = useState<GenderKey>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizDone, setQuizDone] = useState(false);
  const [quickViewStyleId, setQuickViewStyleId] = useState<Id<"styles"> | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("rb-style-quiz")) {
      setQuizDone(true);
    }
  }, []);
  if (data === undefined) {
    return <HomepageSkeleton />;
  }

  const { brands, categories, availableTags, featuredProducts, promotions, heroBanners, promoBanners } = data;

  // Find the first flash sale banner with an endDate for the countdown
  const flashSaleBanner = promoBanners?.find(
    (b: { placement?: string; endDate?: number }) =>
      b.placement === "flash_sale" && b.endDate
  );

  // ── Gender filter → categories ──
  const genderFilteredCategories =
    selectedGender === "all"
      ? categories
      : categories.filter((c) => matchesGender(c.genders, selectedGender));

  // Brands filtered by gender, then by tag (brand's own tags)
  const genderFilteredBrands =
    selectedGender === "all"
      ? brands
      : brands.filter((b) => matchesGender(b.genders, selectedGender));

  const filteredBrands = selectedTag
    ? genderFilteredBrands.filter((b) => (b.tags ?? []).includes(selectedTag))
    : genderFilteredBrands;

  // ── Tag filter → categories (only categories whose brand matches the tag) ──
  const tagFilteredCategories = selectedTag
    ? genderFilteredCategories.filter((c) =>
        c.brandIds.some((bid) =>
          filteredBrands.some((b) => String(b._id) === bid)
        )
      )
    : genderFilteredCategories;

  // Featured products filtered by gender + tag
  const genderFilteredProducts =
    selectedGender === "all"
      ? featuredProducts
      : featuredProducts.filter((p) =>
          matchesGender(p.genders, selectedGender)
        );

  const filteredProducts = selectedTag
    ? genderFilteredProducts.filter((p) => (p.tags ?? []).includes(selectedTag))
    : genderFilteredProducts;

  const activeTheme = GENDER_THEMES[selectedGender];

  return (
    <div className="pb-6">
      {/* ── 0. Gender Tabs + Tag Pills ── */}
      <div className="mx-auto max-w-7xl px-4 pt-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {GENDER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setSelectedGender(tab.key);
                setSelectedTag(null);
              }}
              className={cn(
                "flex-shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                selectedGender === tab.key
                  ? activeTheme.pill
                  : "border-border bg-transparent text-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </button>
          ))}
          {/* Divider */}
          {availableTags.length > 0 && (
            <span className="mx-1 self-center h-5 w-px bg-border flex-shrink-0" />
          )}
          {/* Tag pills */}
          {availableTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={cn(
                "flex-shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                selectedTag === tag
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. Brand Circles (filtered by gender + tag) ── */}
      {filteredBrands.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-2">
          <HScrollRow>
            {filteredBrands.map((brand) => (
              <Link
                key={brand._id}
                href={`/browse/${brand._id}`}
                className="flex flex-shrink-0 snap-start flex-col items-center gap-1.5"
                style={{ width: 80 }}
              >
                <span
                  className={cn(
                    "relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 text-xl transition-all hover:shadow-md",
                    selectedGender !== "all"
                      ? activeTheme.circle
                      : "border-border bg-card"
                  )}
                >
                  {brand.imageUrl ? (
                    <Image
                      src={brand.imageUrl}
                      alt={brand.name}
                      fill
                      sizes="64px"
                      className="object-contain p-2 rounded-full"
                    />
                  ) : brand.logo ? (
                    <span className="text-2xl">{brand.logo}</span>
                  ) : (
                    <span
                      className={cn(
                        "font-display text-lg font-bold",
                        selectedGender !== "all" ? "" : "text-primary"
                      )}
                    >
                      {brand.name.charAt(0)}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[11px] font-medium text-muted-foreground">
                  {brand.name}
                </span>
              </Link>
            ))}
          </HScrollRow>
        </div>
      )}

      {/* ── 3. Hero Banner Carousel ── */}
      <div className="mt-5">
        <HeroBannerCarousel dbBanners={heroBanners} />
      </div>

      {/* ── 3a. Flash Sale Countdown ── */}
      {flashSaleBanner && (
        <div className="mx-auto max-w-7xl px-4 pt-5">
          <FlashSaleCountdown endDate={flashSaleBanner.endDate!} />
        </div>
      )}

      {/* ── 3b. Payday Sale Banner ── */}
      <PaydayBanner />

      {/* ── Daily Check-In ── */}
      <DailyCheckIn />

      {/* ── Personalized Dashboard ── */}
      <PersonalizedDashboard />

      {/* ── Style Quiz Banner ── */}
      {!quizDone && (
        <div className="mx-auto max-w-7xl px-4 pt-5">
          <button
            onClick={() => setShowQuiz(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
          >
            <span className="text-2xl">✨</span>
            <div className="flex-1">
              <p className="text-sm font-bold">Not sure what to get?</p>
              <p className="text-xs text-muted-foreground">Take our 30-second Style Quiz for personalized picks</p>
            </div>
            <ArrowRight className="h-4 w-4 text-primary" />
          </button>
        </div>
      )}
      <StyleQuiz open={showQuiz} onClose={() => { setShowQuiz(false); setQuizDone(true); }} />

      {/* ── 3b. Trending Now ── */}
      <TrendingNowSection onQuickView={setQuickViewStyleId} />

      {/* ── 3c. Style Duel of the Week ── */}
      <StyleDuel />

      {/* ── 4. Hot Deals Mini Carousel ── */}
      {promotions.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-6">
          <HotDealsCarousel promotions={promotions} />
        </div>
      )}

      {/* ── 5. Shop by Category ── */}
      {categories.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-tight">
              Shop by Category
            </h2>
            <Link
              href="/browse"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              See All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <HScrollRow className="mt-4">
            {tagFilteredCategories.slice(0, 10).map((cat, i) => (
              <Link
                key={cat.name}
                href={`/browse/${cat.brandIds[0]}`}
                className="group flex-shrink-0 snap-start"
                style={{ width: 160 }}
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-secondary">
                  {cat.imageUrl && (
                    <Image
                      src={cat.imageUrl}
                      alt={cat.name}
                      fill
                      sizes="160px"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  )}
                  <div
                    className={cn(
                      "absolute inset-0 flex items-end p-3",
                      "bg-gradient-to-t from-black/60 to-transparent"
                    )}
                  >
                    <div>
                      <p className="font-display text-sm font-bold uppercase text-white">
                        {cat.name}
                      </p>
                      <p className="text-[10px] text-white/70">
                        {cat.count} style{cat.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </HScrollRow>
        </div>
      )}

      {/* ── 6. You Might Like This (Featured Products) ── */}
      {filteredProducts.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-tight">
              You Might Like This
            </h2>
            <Link
              href="/search"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              See All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <HScrollRow className="mt-4">
            {filteredProducts.map((product) => (
              <Link
                key={product._id}
                href={`/browse/style/${product._id}`}
                className="group flex-shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-card"
                style={{ width: 180 }}
              >
                <div className="relative aspect-[3/4] w-full bg-secondary">
                  {product.primaryImageUrl ? (
                    <Image
                      src={product.primaryImageUrl}
                      alt={product.name}
                      fill
                      sizes="180px"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : product.brandLogoUrl ? (
                    <div className="flex h-full items-center justify-center p-6">
                      <Image
                        src={product.brandLogoUrl}
                        alt={product.brandName}
                        fill
                        sizes="180px"
                        className="object-contain p-6"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  {/* Wishlist heart */}
                  <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-muted-foreground backdrop-blur-sm">
                    <Heart className="h-3.5 w-3.5" />
                  </div>
                  {/* Quick View button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setQuickViewStyleId(product._id as Id<"styles">);
                    }}
                    className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-900 opacity-0 shadow-md backdrop-blur-sm transition-all group-hover:opacity-100"
                  >
                    Quick View
                  </button>
                </div>
                <div className="p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {product.brandName}
                  </p>
                  <p className="mt-0.5 text-sm font-medium leading-tight line-clamp-2">
                    {product.name}
                  </p>
                  <p className="mt-1 font-mono text-sm font-bold text-primary">
                    {formatPrice(product.minPriceCentavos)}
                  </p>
                </div>
              </Link>
            ))}
          </HScrollRow>
        </div>
      )}

      {/* ── 7. Top Brands Grid ── */}
      {brands.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-8">
          <h2 className="font-display text-lg font-bold uppercase tracking-tight">
            Top Brands
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {brands.slice(0, 6).map((brand) => (
              <Link
                key={brand._id}
                href={`/browse/${brand._id}`}
                className="group relative flex aspect-[4/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary hover:shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/5 opacity-0 transition-opacity group-hover:opacity-100" />
                {brand.imageUrl ? (
                  <div className="relative h-16 w-16">
                    <Image
                      src={brand.imageUrl}
                      alt={brand.name}
                      fill
                      sizes="64px"
                      className="object-contain"
                    />
                  </div>
                ) : brand.logo ? (
                  <span className="text-4xl">{brand.logo}</span>
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                    {brand.name.charAt(0)}
                  </span>
                )}
                <span className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                  {brand.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 8. Recommended For You (second batch of products) ── */}
      {filteredProducts.length > 4 && (
        <div className="mx-auto max-w-7xl px-4 pt-8">
          <h2 className="font-display text-lg font-bold uppercase tracking-tight">
            Recommended For You
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.slice(0, 8).map((product) => (
              <Link
                key={product._id}
                href={`/browse/style/${product._id}`}
                className="group overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="relative aspect-[3/4] w-full bg-secondary">
                  {product.primaryImageUrl ? (
                    <Image
                      src={product.primaryImageUrl}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : product.brandLogoUrl ? (
                    <div className="flex h-full items-center justify-center p-6">
                      <Image
                        src={product.brandLogoUrl}
                        alt={product.brandName}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-contain p-6"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-muted-foreground backdrop-blur-sm">
                    <Heart className="h-3.5 w-3.5" />
                  </div>
                  {/* Quick View button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setQuickViewStyleId(product._id as Id<"styles">);
                    }}
                    className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-900 opacity-0 shadow-md backdrop-blur-sm transition-all group-hover:opacity-100"
                  >
                    Quick View
                  </button>
                </div>
                <div className="p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {product.brandName}
                  </p>
                  <p className="mt-0.5 text-sm font-medium leading-tight line-clamp-2">
                    {product.name}
                  </p>
                  <p className="mt-1.5 font-mono text-sm font-bold text-primary">
                    {formatPrice(product.minPriceCentavos)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 9. Recently Viewed ── */}
      <RecentlyViewedSection />

      {/* ── 10. Free Shipping Banner ── */}
      <div className="mx-auto max-w-7xl px-4 pt-8">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-600">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="font-display text-sm font-bold uppercase">
              Free Shipping on Orders Over ₱999
            </p>
            <p className="text-xs text-muted-foreground">
              Cash on Delivery available nationwide
            </p>
          </div>
          <Link
            href="/search"
            className="hidden text-sm font-medium text-primary hover:underline sm:block"
          >
            Shop Now
          </Link>
        </div>
      </div>

      {/* ═══ Quick View Bottom Sheet ═══ */}
      <QuickViewSheet
        styleId={quickViewStyleId}
        onClose={() => setQuickViewStyleId(null)}
      />
    </div>
  );
}

// ─── Trending Now Section ─────────────────────────────────────────────────────
function TrendingNowSection({ onQuickView }: { onQuickView: (id: Id<"styles">) => void }) {
  const trending = useQuery(api.storefront.homepage.getTrendingProducts, {
    limit: 12,
  });

  if (!trending || trending.length === 0) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold uppercase tracking-tight">
            Trending Now
          </h2>
        </div>
        <Link
          href="/bestsellers"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View All <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <HScrollRow className="mt-4">
        {trending.map((product) => (
          <Link
            key={product.styleId}
            href={`/browse/style/${product.styleId}`}
            className="group flex-shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-card"
            style={{ width: 180 }}
          >
            <div className="relative aspect-[3/4] w-full bg-secondary">
              {product.primaryImageUrl ? (
                <Image
                  src={product.primaryImageUrl}
                  alt={product.name}
                  fill
                  sizes="180px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : product.brandLogoUrl ? (
                <div className="flex h-full items-center justify-center p-6">
                  <Image
                    src={product.brandLogoUrl}
                    alt={product.brandName}
                    fill
                    sizes="180px"
                    className="object-contain p-6"
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              {/* Sold count badge */}
              <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                <TrendingUp className="h-3 w-3" />
                {product.soldCount} sold this month
              </div>
              {/* Quick View button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQuickView(product.styleId as Id<"styles">);
                }}
                className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-900 opacity-0 shadow-md backdrop-blur-sm transition-all group-hover:opacity-100"
              >
                Quick View
              </button>
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
            </div>
          </Link>
        ))}
      </HScrollRow>
    </div>
  );
}

// ─── Recently Viewed Section ─────────────────────────────────────────────────
function RecentlyViewedSection() {
  const recentlyViewed = useQuery(
    api.storefront.recentlyViewed.getRecentlyViewed,
    { limit: 12 }
  );

  if (!recentlyViewed || recentlyViewed.length === 0) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-bold uppercase tracking-tight">
          Continue Shopping
        </h2>
      </div>
      <HScrollRow>
        {recentlyViewed.map((item) => (
          <Link
            key={item!.styleId}
            href={`/browse/style/${item!.styleId}`}
            className="w-36 flex-shrink-0 snap-start"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-border bg-secondary">
              {item!.primaryImageUrl ? (
                <Image
                  src={item!.primaryImageUrl}
                  alt={item!.name}
                  fill
                  sizes="144px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ShoppingBag className="h-8 w-8" />
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">
              {item!.brandName}
            </p>
            <p className="mt-0.5 text-sm font-medium leading-tight line-clamp-2">
              {item!.name}
            </p>
            <p className="mt-1 font-mono text-sm font-bold text-primary">
              {formatPrice(item!.basePriceCentavos)}
            </p>
          </Link>
        ))}
      </HScrollRow>
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────
function HomepageSkeleton() {
  return (
    <div className="pb-6">
      {/* Category pills skeleton */}
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
      </div>

      {/* Brand circles skeleton */}
      <div className="mx-auto max-w-7xl px-4 pt-5">
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5" style={{ width: 80 }}>
              <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-14 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="mt-5 flex flex-col items-center px-4 py-16">
        <div className="h-10 w-72 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-11 w-36 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Product cards skeleton */}
      <div className="mx-auto max-w-7xl px-4 pt-8">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-4 flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-44 flex-shrink-0 space-y-2 rounded-lg border border-border p-2">
              <div className="aspect-[3/4] animate-pulse rounded bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
