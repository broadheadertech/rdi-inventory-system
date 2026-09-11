// The ordering-cycle basis as badges — verdict, movement, aging, HQ sign-off —
// shared by the store's Ordering Cycle page and HQ's sign-off queue, so both
// read a line the same way.

import { cn } from "@/lib/utils";

export type Verdict = "order" | "review" | "dontOrder";
export type Movement = "fast" | "medium" | "slow" | "none";
export type AgingTier = "green" | "yellow" | "red";
export type SignOffStatus = "pending" | "approved" | "rejected";

export const VERDICT_ORDER: Verdict[] = ["order", "review", "dontOrder"];

export const VERDICT_META: Record<Verdict, { label: string; tone: string }> = {
  order: { label: "Order", tone: "border-green-200 bg-green-100 text-green-800" },
  review: { label: "Review", tone: "border-amber-200 bg-amber-100 text-amber-800" },
  dontOrder: { label: "Don't order", tone: "border-gray-200 bg-gray-100 text-gray-700" },
};

const MOVEMENT_META: Record<Movement, { label: string; tone: string }> = {
  fast: { label: "Fast", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  medium: { label: "Normal", tone: "border-sky-200 bg-sky-50 text-sky-800" },
  slow: { label: "Slow", tone: "border-orange-200 bg-orange-50 text-orange-800" },
  none: { label: "No sales", tone: "border-red-200 bg-red-50 text-red-700" },
};

const AGING_META: Record<AgingTier, { label: string; tone: string; hint: string }> = {
  green: {
    label: "Fresh",
    tone: "border-green-200 bg-green-50 text-green-800",
    hint: "Oldest units here are 90 days old or less",
  },
  yellow: {
    label: "Aging",
    tone: "border-yellow-200 bg-yellow-50 text-yellow-800",
    hint: "Oldest units here are 91–180 days old",
  },
  red: {
    label: "Aged",
    tone: "border-red-200 bg-red-50 text-red-700",
    hint: "Oldest units here are over 180 days old",
  },
};

const SIGN_OFF_META: Record<SignOffStatus, { label: string; tone: string }> = {
  pending: { label: "Awaiting HQ", tone: "text-amber-700" },
  approved: { label: "HQ approved", tone: "text-green-700" },
  rejected: { label: "HQ rejected", tone: "text-red-600" },
};

function Chip({ label, tone, title }: { label: string; tone: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium",
        tone
      )}
    >
      {label}
    </span>
  );
}

const Dash = () => <span className="text-xs text-muted-foreground">—</span>;

export function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return <Dash />;
  const meta = VERDICT_META[verdict];
  return <Chip label={meta.label} tone={meta.tone} />;
}

/** Movement, with the days of cover it was judged on (under 14 fast, over 60 slow). */
export function MovementBadge({
  movement,
  score,
}: {
  movement: Movement | null;
  score: number | null;
}) {
  if (!movement) return <Dash />;
  const meta = MOVEMENT_META[movement];
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Chip label={meta.label} tone={meta.tone} />
      {movement !== "none" && score !== null && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{score}d cover</span>
      )}
    </div>
  );
}

export function AgingBadge({ tier, days }: { tier: AgingTier | null; days: number | null }) {
  if (!tier) return <Dash />;
  const meta = AGING_META[tier];
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Chip label={meta.label} tone={meta.tone} title={meta.hint} />
      {days !== null && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{days}d</span>
      )}
    </div>
  );
}

export function SignOffBadge({ status, note }: { status: SignOffStatus; note: string | null }) {
  const meta = SIGN_OFF_META[status];
  return (
    <span
      title={note ?? undefined}
      className={cn("whitespace-nowrap text-[11px] font-medium", meta.tone)}
    >
      {meta.label}
    </span>
  );
}

/**
 * Whether an included line waits for HQ sign-off: the verdict alone approves
 * only an Order line at or under its suggested quantity. Mirrors needsSignOff
 * in convex/inventory/orderingCycles.ts.
 */
export function lineNeedsSignOff(line: {
  included: boolean;
  orderedQuantity: number;
  suggestedQuantity: number;
  verdict: Verdict | null;
}): boolean {
  return (
    line.included &&
    line.orderedQuantity > 0 &&
    (line.verdict !== "order" || line.orderedQuantity > line.suggestedQuantity)
  );
}
