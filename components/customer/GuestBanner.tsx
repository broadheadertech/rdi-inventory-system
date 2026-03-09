"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

export function GuestBanner({ className }: { className?: string }) {
  const { isSignedIn, isLoaded } = useUser();

  // Don't render until Clerk has loaded, or if the user is signed in
  if (!isLoaded || isSignedIn) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 bg-primary/10 px-4 py-2 text-sm text-primary",
        className
      )}
    >
      <span className="text-foreground/70">
        Sign in to reserve items and earn loyalty points
      </span>
      <Link
        href="/sign-in"
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <LogIn className="h-3.5 w-3.5" />
        Sign in
      </Link>
    </div>
  );
}
