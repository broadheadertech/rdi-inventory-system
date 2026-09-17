// convex/_helpers/custody.ts — who holds the goods, and who may take them next.
//
// A transfer changes hands twice: the warehouse gives it to a carrier, and the
// carrier gives it to the branch. Both sides of both handovers are recorded, so
// there is no stretch of the journey where the goods are nobody's
// responsibility.
//
// Two things live here: the rule for who is allowed to receive a transfer, and
// the custody timeline every screen reads.

import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { withBranchScope } from "./withBranchScope";

type Ctx = QueryCtx | MutationCtx;

/** How long a half-finished handshake may sit before it is worth chasing. */
export const HANDSHAKE_LIMITS = {
  /** The carrier handed over, but nobody at the branch has scanned anything. */
  handedOverNotReceivedMs: 4 * 60 * 60 * 1000,
  /** Packed and loaded, but never dispatched. */
  packedNotDispatchedMs: 24 * 60 * 60 * 1000,
  /** In transit with nothing recorded since, and no expected date to judge it by. */
  inTransitSilentMs: 48 * 60 * 60 * 1000,
} as const;

/**
 * The goods may only be received where they were sent. HQ can act for a branch
 * that cannot — a till with no power, a manager locked out — and everyone else
 * is held to their own store.
 *
 * Returns are sent to the warehouse, so warehouse staff receiving a return are
 * simply the destination branch and pass the same rule.
 */
export async function requireDestinationBranch(
  ctx: Ctx,
  transfer: Doc<"transfers">
): Promise<Doc<"users">> {
  const scope = await withBranchScope(ctx);

  // Admin and HQ staff can receive on a branch's behalf, and are audited for it.
  if (scope.canAccessAllBranches) return scope.user;

  if ((scope.branchId as string) !== (transfer.toBranchId as string)) {
    throw new ConvexError({
      code: "WRONG_BRANCH",
      message: "This delivery is for another branch. Only its own staff or HQ can receive it.",
    });
  }
  return scope.user;
}

export type CustodyStep = {
  key: string;
  label: string;
  at: number | null;
  /** Who did it — a person's name, or a carrier's. */
  by: string | null;
  /** What changed hands, when there is a count worth showing. */
  detail: string | null;
  state: "done" | "pending" | "skipped";
};

async function userName(ctx: Ctx, id: Doc<"users">["_id"] | undefined): Promise<string | null> {
  if (!id) return null;
  const user = await ctx.db.get(id);
  return user?.name ?? null;
}

/**
 * The journey of one transfer as a list of steps, each with who and when.
 * Nothing is computed that is not already recorded — this is the one place that
 * reads it all in order, so the warehouse, the driver and the branch see the
 * same story.
 */
export async function custodyTimeline(
  ctx: Ctx,
  transfer: Doc<"transfers">
): Promise<CustodyStep[]> {
  const items = await ctx.db
    .query("transferItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
    .collect();
  const boxes = await ctx.db
    .query("transferBoxes")
    .withIndex("by_transfer", (q) => q.eq("transferId", transfer._id))
    .collect();

  const requested = items.reduce((sum, i) => sum + i.requestedQuantity, 0);
  const packed = items.reduce(
    (sum, i) => sum + (i.packedQuantity ?? 0),
    0
  );
  const received = items.reduce((sum, i) => sum + (i.receivedQuantity ?? 0), 0);
  const pieces = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;

  const carrier = transfer.driverId
    ? await userName(ctx, transfer.driverId)
    : transfer.courierId
      ? ((await ctx.db.get(transfer.courierId))?.name ?? "Courier")
      : null;

  const terminal = transfer.status === "rejected" || transfer.status === "cancelled";

  const steps: CustodyStep[] = [
    {
      key: "requested",
      label: "Requested",
      at: transfer.createdAt,
      by: await userName(ctx, transfer.requestedById),
      detail: pieces(requested),
      state: "done",
    },
    {
      key: "approved",
      label: "Approved",
      at: transfer.approvedAt ?? null,
      by: await userName(ctx, transfer.approvedById),
      detail: null,
      state: transfer.approvedAt ? "done" : terminal ? "skipped" : "pending",
    },
    {
      key: "packed",
      label: "Packed",
      at: transfer.packedAt ?? null,
      by: await userName(ctx, transfer.packedById),
      detail: transfer.packedAt
        ? boxes.length > 0
          ? `${pieces(packed)} in ${boxes.length} ${boxes.length === 1 ? "box" : "boxes"}`
          : pieces(packed)
        : null,
      state: transfer.packedAt ? "done" : terminal ? "skipped" : "pending",
    },
    {
      key: "loaded",
      label: "Loaded out",
      at: transfer.loadedAt ?? null,
      by: await userName(ctx, transfer.loadedById),
      detail: transfer.loadedAt
        ? [
            transfer.loadedBoxCount !== undefined
              ? `${transfer.loadedBoxCount} ${transfer.loadedBoxCount === 1 ? "box" : "boxes"}`
              : pieces(packed),
            transfer.handedToName ? `to ${transfer.handedToName}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
      state: transfer.loadedAt ? "done" : terminal ? "skipped" : "pending",
    },
    {
      key: "dispatched",
      label: "Dispatched",
      at: transfer.shippedAt ?? null,
      by: await userName(ctx, transfer.shippedById),
      detail: transfer.shippedAt
        ? [
            carrier ? `with ${carrier}` : "no carrier",
            transfer.trackingNumber ? `tracking ${transfer.trackingNumber}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
      state: transfer.shippedAt ? "done" : terminal ? "skipped" : "pending",
    },
  ];

  // The driver's own legs only exist when a driver was assigned.
  if (transfer.driverId) {
    steps.push(
      {
        key: "driverAccepted",
        label: "Driver accepted",
        at: transfer.driverAcceptedAt ?? null,
        by: carrier,
        detail: null,
        state: transfer.driverAcceptedAt ? "done" : terminal ? "skipped" : "pending",
      },
      {
        key: "driverArrived",
        label: "Arrived at branch",
        at: transfer.driverArrivedAt ?? null,
        by: carrier,
        detail: null,
        state: transfer.driverArrivedAt ? "done" : terminal ? "skipped" : "pending",
      },
      {
        key: "handedOver",
        label: "Handed over",
        at: transfer.driverHandedOverAt ?? null,
        by: carrier,
        detail: transfer.driverReceivedByName
          ? `received by ${transfer.driverReceivedByName}`
          : null,
        state: transfer.driverHandedOverAt ? "done" : terminal ? "skipped" : "pending",
      }
    );
  }

  steps.push({
    key: "received",
    label: "Received at branch",
    at: transfer.deliveredAt ?? null,
    by: await userName(ctx, transfer.deliveredById),
    detail: transfer.deliveredAt
      ? [
          `${pieces(received)} scanned`,
          transfer.receivedFromName ? `from ${transfer.receivedFromName}` : null,
          received !== packed ? `${Math.abs(received - packed)} ${received < packed ? "short" : "over"}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
    state: transfer.deliveredAt ? "done" : terminal ? "skipped" : "pending",
  });

  if (terminal) {
    steps.push({
      key: transfer.status,
      label: transfer.status === "rejected" ? "Rejected" : "Cancelled",
      at: transfer.rejectedAt ?? transfer.cancelledAt ?? null,
      by: await userName(ctx, transfer.rejectedById ?? transfer.cancelledById),
      detail: transfer.rejectedReason ?? null,
      state: "done",
    });
  }

  return steps;
}
