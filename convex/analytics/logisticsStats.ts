// convex/analytics/logisticsStats.ts — the arithmetic behind the logistics
// report, kept apart from the database so it can be tested directly.
//
// Every number on that page comes through here, and the failure mode is quiet:
// a median off by one position, or a stage credited with a gap it never
// recorded, reads as a perfectly plausible figure.

const HOUR_MS = 60 * 60 * 1000;

export type Stat = {
  count: number;
  avgHours: number;
  medianHours: number;
  p90Hours: number;
  maxHours: number;
};

export const EMPTY_STAT: Stat = {
  count: 0,
  avgHours: 0,
  medianHours: 0,
  p90Hours: 0,
  maxHours: 0,
};

export function hours(ms: number): number {
  return Math.round((ms / HOUR_MS) * 10) / 10;
}

/**
 * p90 rather than max: one transfer that sat over a long weekend tells you
 * nothing, while the figure nine in ten beat is a promise you can make.
 *
 * Nearest-rank, so on a short series it lands on an observation that really
 * happened rather than between two that did.
 */
export function statOf(values: number[]): Stat {
  if (values.length === 0) return EMPTY_STAT;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const p90 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)];
  return {
    count: sorted.length,
    avgHours: hours(total / sorted.length),
    medianHours: hours(median),
    p90Hours: hours(p90),
    maxHours: hours(sorted[sorted.length - 1]),
  };
}

/**
 * A gap counts only when both ends were recorded, and in that order.
 *
 * Out-of-order timestamps happen — a transfer back-filled by hand, a clock
 * disagreeing — and a negative duration averaged in would pull a stage below
 * zero and make it look faster than instant. It is dropped instead, and the
 * stage reports how many transfers it was measured on so the hole shows.
 */
export function gap(from: number | undefined, to: number | undefined): number | null {
  if (from === undefined || to === undefined) return null;
  const span = to - from;
  return span >= 0 ? span : null;
}

// ─── The stages a transfer passes through ────────────────────────────────────
// The three marked ones are the handshake: custody changing hands. They are
// where goods go quiet, and nothing in the system measured them before.

export const STAGES = [
  { key: "requestToApprove", label: "Requested → Approved", handshake: false },
  { key: "approveToPack", label: "Approved → Packed", handshake: false },
  { key: "packToLoad", label: "Packed → Loaded out", handshake: true },
  { key: "loadToShip", label: "Loaded → Dispatched", handshake: false },
  { key: "shipToAccept", label: "Dispatched → Driver accepted", handshake: true },
  { key: "acceptToArrive", label: "Accepted → Arrived", handshake: false },
  { key: "arriveToReceive", label: "Arrived → Scanned in", handshake: true },
  { key: "total", label: "Requested → Received", handshake: false },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

/** The timestamps a stage measurement needs, as a transfer carries them. */
export type TransferTimings = {
  createdAt: number;
  approvedAt?: number;
  packedAt?: number;
  loadedAt?: number;
  shippedAt?: number;
  driverAcceptedAt?: number;
  driverArrivedAt?: number;
  deliveredAt?: number;
};

export function stageGaps(t: TransferTimings): Record<StageKey, number | null> {
  return {
    requestToApprove: gap(t.createdAt, t.approvedAt),
    approveToPack: gap(t.approvedAt, t.packedAt),
    packToLoad: gap(t.packedAt, t.loadedAt),
    loadToShip: gap(t.loadedAt, t.shippedAt),
    shipToAccept: gap(t.shippedAt, t.driverAcceptedAt),
    acceptToArrive: gap(t.driverAcceptedAt, t.driverArrivedAt),
    arriveToReceive: gap(t.driverArrivedAt, t.deliveredAt),
    total: gap(t.createdAt, t.deliveredAt),
  };
}

/**
 * What one received line was short or over by, and nothing netted.
 *
 * Netting is the trap: a transfer two short on one SKU and two over on
 * another is not a transfer that arrived correctly. They are two separate
 * mistakes and both have to show.
 */
export function lineDifference(
  packedQuantity: number | undefined,
  requestedQuantity: number,
  receivedQuantity: number | undefined
): { packed: number; received: number; short: number; over: number } {
  // What should have arrived is what was packed; a transfer that never went
  // through packing is judged against what was asked for.
  const packed = packedQuantity ?? requestedQuantity;
  const received = receivedQuantity ?? 0;
  const difference = received - packed;
  return {
    packed,
    received,
    short: difference < 0 ? -difference : 0,
    over: difference > 0 ? difference : 0,
  };
}
