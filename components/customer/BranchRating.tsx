"use client";

import { useState, useEffect } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── localStorage helpers ────────────────────────────────────────────────────

function storageKey(reservationId: string) {
  return `rb-branch-rating-${reservationId}`;
}

function hasAlreadyRated(reservationId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(storageKey(reservationId)) === "true";
}

function markAsRated(reservationId: string) {
  localStorage.setItem(storageKey(reservationId), "true");
}

// ─── Component ───────────────────────────────────────────────────────────────

interface BranchRatingProps {
  reservationId: string;
  branchName: string;
}

export default function BranchRating({
  reservationId,
  branchName,
}: BranchRatingProps) {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  useEffect(() => {
    setAlreadyRated(hasAlreadyRated(reservationId));
  }, [reservationId]);

  if (alreadyRated) return null;

  function handleSubmit() {
    if (rating === 0) {
      toast.error("Please select a rating before submitting.");
      return;
    }

    markAsRated(reservationId);
    setSubmitted(true);
    toast.success("Thanks for rating your experience!");
  }

  if (submitted) {
    return (
      <div className="mt-6 rounded-lg border border-border bg-card p-5 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        </div>
        <p className="text-sm font-medium">Thanks for your feedback!</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your rating helps us improve our branches.
        </p>
      </div>
    );
  }

  const displayRating = hoveredStar || rating;

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-5">
      <p className="text-center text-sm font-medium">
        How was your experience at {branchName}?
      </p>

      {/* Star selector */}
      <div className="mt-3 flex items-center justify-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredStar(star)}
            onMouseLeave={() => setHoveredStar(0)}
            className="rounded p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                star <= displayRating
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
      </div>

      {/* Optional comment */}
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Any comments? (optional)"
        maxLength={200}
        className="mt-3 w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        className="mt-3 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        Submit
      </button>
    </div>
  );
}
