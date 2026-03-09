"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPrice, cn } from "@/lib/utils";
import { Swords, Timer, Check } from "lucide-react";

export function StyleDuel() {
  const duel = useQuery(api.storefront.styleDuels.getCurrentDuel);
  const results = useQuery(
    api.storefront.styleDuels.getDuelResults,
    duel
      ? { styleAId: duel.styleA._id, styleBId: duel.styleB._id }
      : "skip"
  );
  const voteDuel = useMutation(api.storefront.styleDuels.voteDuel);

  const [voted, setVoted] = useState<Id<"styles"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");

  // Weekly countdown timer
  useEffect(() => {
    function updateCountdown() {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const currentWeekNumber = Math.floor(Date.now() / weekMs);
      const nextWeekStart = (currentWeekNumber + 1) * weekMs;
      const remaining = nextWeekStart - Date.now();

      const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
      const hours = Math.floor(
        (remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
      );
      const minutes = Math.floor(
        (remaining % (60 * 60 * 1000)) / (60 * 1000)
      );

      if (days > 0) {
        setCountdown(`${days}d ${hours}h`);
      } else {
        setCountdown(`${hours}h ${minutes}m`);
      }
    }

    updateCountdown();
    const timer = setInterval(updateCountdown, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (duel === undefined) return null; // loading
  if (duel === null) return null; // not enough styles

  const handleVote = async (styleId: Id<"styles">) => {
    if (voted) return;
    setError(null);
    try {
      await voteDuel({ weekId: duel.weekId, styleId });
      setVoted(styleId);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not submit vote.";
      // If already voted, mark as voted with a visual cue
      if (msg.includes("already voted")) {
        setVoted(styleId);
      }
      setError(msg);
    }
  };

  const hasResults = voted !== null && results;
  const totalVotes = results?.totalVotes ?? 0;
  const pctA =
    totalVotes > 0 ? Math.round(((results?.styleAVotes ?? 0) / totalVotes) * 100) : 50;
  const pctB = totalVotes > 0 ? 100 - pctA : 50;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8">
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600">
              <Swords className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold uppercase tracking-tight">
                Style Duel of the Week
              </h3>
              <p className="text-[11px] text-zinc-400">
                Pick your favorite — which one wins?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-[11px] text-zinc-400">
            <Timer className="h-3 w-3" />
            <span>New duel in {countdown}</span>
          </div>
        </div>

        {/* Duel Cards */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-2">
          {/* Style A */}
          <DuelCard
            style={duel.styleA}
            voted={voted}
            isWinner={!!(hasResults && pctA >= pctB)}
            percentage={hasResults ? pctA : null}
            voteCount={results?.styleAVotes}
            onVote={() => handleVote(duel.styleA._id)}
          />

          {/* Style B */}
          <DuelCard
            style={duel.styleB}
            voted={voted}
            isWinner={!!(hasResults && pctB > pctA)}
            percentage={hasResults ? pctB : null}
            voteCount={results?.styleBVotes}
            onVote={() => handleVote(duel.styleB._id)}
          />
        </div>

        {/* Total votes footer */}
        {hasResults && (
          <div className="border-t border-zinc-800 px-5 py-3 text-center text-[11px] text-zinc-500">
            {totalVotes} total vote{totalVotes !== 1 ? "s" : ""} this round
          </div>
        )}

        {/* Error message */}
        {error && !error.includes("already voted") && (
          <div className="px-5 pb-3 text-center text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Duel Card ───────────────────────────────────────────────────────────────

function DuelCard({
  style,
  voted,
  isWinner,
  percentage,
  voteCount,
  onVote,
}: {
  style: {
    _id: Id<"styles">;
    name: string;
    brandName: string;
    imageUrl: string | null;
    basePriceCentavos: number;
  };
  voted: Id<"styles"> | null;
  isWinner: boolean;
  percentage: number | null;
  voteCount?: number;
  onVote: () => void;
}) {
  const isSelected = voted === style._id;
  const hasVoted = voted !== null;

  return (
    <button
      onClick={onVote}
      disabled={hasVoted}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border transition-all",
        hasVoted
          ? isSelected
            ? "border-red-500 ring-2 ring-red-500/30"
            : "border-zinc-700 opacity-75"
          : "border-zinc-700 hover:border-zinc-500 hover:ring-1 hover:ring-zinc-500/30 active:scale-[0.98]"
      )}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] w-full bg-zinc-800">
        {style.imageUrl ? (
          <Image
            src={style.imageUrl}
            alt={style.name}
            fill
            sizes="(max-width: 768px) 45vw, 300px"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <Swords className="h-10 w-10" />
          </div>
        )}

        {/* Selected check badge */}
        {isSelected && (
          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 shadow-lg">
            <Check className="h-4 w-4 text-white" />
          </div>
        )}

        {/* Percentage overlay after vote */}
        {percentage !== null && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
            <div className="text-center">
              <span
                className={cn(
                  "font-display text-2xl font-black sm:text-3xl",
                  isWinner ? "text-red-500" : "text-zinc-400"
                )}
              >
                {percentage}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  isWinner ? "bg-red-500" : "bg-zinc-500"
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col bg-zinc-900 p-3 text-left">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {style.brandName}
        </p>
        <p className="mt-0.5 text-sm font-medium leading-tight text-zinc-200 line-clamp-2">
          {style.name}
        </p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-mono text-sm font-bold text-red-500">
            {formatPrice(style.basePriceCentavos)}
          </span>
          {voteCount !== undefined && hasVoted && (
            <span className="text-[10px] text-zinc-500">
              {voteCount} vote{voteCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Hover prompt (before voting) */}
      {!hasVoted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <span className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
            Vote This
          </span>
        </div>
      )}
    </button>
  );
}
