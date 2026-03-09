"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  title: string;
  text: string;
  url?: string;
  className?: string;
}

export function ShareButton({ title, text, url, className }: ShareButtonProps) {
  async function handleShare() {
    const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch {
        // User cancelled share
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard!");
      } catch {
        toast.error("Failed to copy link");
      }
    }
  }

  return (
    <button
      onClick={handleShare}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-secondary",
        className
      )}
      aria-label="Share"
    >
      <Share2 className="h-4 w-4" />
    </button>
  );
}
