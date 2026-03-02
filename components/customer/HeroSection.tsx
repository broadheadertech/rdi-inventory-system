"use client";

import Link from "next/link";

export function HeroSection() {
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
    </section>
  );
}
