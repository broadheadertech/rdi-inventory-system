"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { ThumbsUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

interface VoteButtonProps {
  styleId: Id<"styles">;
  className?: string;
}

export function VoteButton({ styleId, className }: VoteButtonProps) {
  const voteData = useQuery(api.storefront.voting.getVoteCount, { styleId });
  const voteForProduct = useMutation(api.storefront.voting.voteForProduct);
  const [loading, setLoading] = useState(false);

  async function handleVote(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading || voteData?.hasVoted) return;
    setLoading(true);
    try {
      await voteForProduct({ styleId });
      toast.success("Vote recorded! Thanks for your input.");
    } catch (err: any) {
      if (err?.message?.includes("already voted")) {
        toast.info("You've already voted for this product.");
      } else if (err?.message?.includes("logged in")) {
        toast.error("Please sign in to vote.");
      } else {
        toast.error("Could not submit vote. Try again.");
      }
    }
    setLoading(false);
  }

  if (voteData === undefined) return null;

  return (
    <button
      onClick={handleVote}
      disabled={loading || voteData.hasVoted}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-all",
        voteData.hasVoted
          ? "border-[#E8192C]/40 bg-[#E8192C]/10 text-[#E8192C]"
          : "border-border text-muted-foreground hover:border-[#E8192C]/40 hover:text-[#E8192C]",
        className
      )}
      aria-label={voteData.hasVoted ? "Already voted" : "Vote for this product"}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ThumbsUp
          className={cn(
            "h-3 w-3 transition-colors",
            voteData.hasVoted && "fill-current"
          )}
        />
      )}
      <span>{voteData.count}</span>
    </button>
  );
}
