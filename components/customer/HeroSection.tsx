"use client";

import Link from "next/link";
import { useNearestBranch } from "@/lib/hooks/useNearestBranch";

export function HeroSection() {
  const { nearestBranch, distanceKm, isLoading, error } = useNearestBranch();

  const showBadge = !isLoading && !error && nearestBranch && distanceKm !== null;

  return (
    <section className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center lg:min-h-[80vh]">
      {/* Subtle gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(232,25,44,0.08) 0%, transparent 60%)",
        }}
      />

      {/* Headline */}
      <h1
        className="font-display text-5xl font-extrabold uppercase tracking-tight sm:text-6xl lg:text-8xl"
      >
        THINK INSIDE
        <br />
        <span className="text-primary">THE BOX</span>
      </h1>

      {/* Subtitle */}
      <p className="mt-4 max-w-md text-sm text-muted-foreground sm:text-base lg:text-lg">
        Premium Streetwear. Check Stock. Reserve. Pick Up.
      </p>

      {/* Dual CTAs */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Link
          href="/branches"
          className="font-mono inline-flex min-h-[48px] items-center justify-center rounded-md bg-primary px-8 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-[var(--customer-accent-dark)]"
        >
          Find Your RedBox
        </Link>
        <Link
          href="/browse"
          className="font-mono inline-flex min-h-[48px] items-center justify-center rounded-md border border-foreground/30 px-8 py-3 text-sm font-bold uppercase tracking-wider text-foreground transition-colors hover:border-foreground hover:bg-accent"
        >
          See What&apos;s Dropping
        </Link>
      </div>

      {/* Nearest branch badge */}
      <div
        className={`mt-6 transition-all duration-500 ${
          showBadge
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        {showBadge && (
          <Link
            href="/branches"
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-foreground sm:text-sm"
          >
            <span aria-hidden="true" className="text-primary">
              &#x1F4CD;
            </span>
            Your nearest RedBox:{" "}
            <span className="font-semibold text-foreground">
              {nearestBranch.name}
            </span>{" "}
            &mdash; {distanceKm} km away
          </Link>
        )}
      </div>
    </section>
  );
}
