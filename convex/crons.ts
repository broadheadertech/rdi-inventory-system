// convex/crons.ts — Scheduled background jobs

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Cast — generated types may not include notifications module until next codegen
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal = internal as any;

const crons = cronJobs();

// Hourly low-stock sweep — fallback for stock changes not triggered by POS transactions
crons.interval(
  "low-stock-sweep",
  { hours: 1 },
  internal.inventory.alerts.sweepLowStock
);

// Hourly reservation expiry — expire unfulfilled reservations older than 24h
crons.interval(
  "expire-reservations",
  { hours: 1 },
  internal.reservations.expiry.expireReservations
);

// Weekly demand summary — Monday 6 AM PHT = Sunday 22:00 UTC
crons.weekly(
  "demand-summary",
  { dayOfWeek: "sunday", hourUTC: 22, minuteUTC: 0 },
  internal.demand.summaries.generateWeeklySummary
);

// Daily restock suggestion generation — 5 AM PHT = 21:00 UTC previous day
crons.daily(
  "restock-suggestions",
  { hourUTC: 21, minuteUTC: 0 },
  internal.ai.restockSuggestions.generateRestockSuggestions
);

// Daily branch performance scoring — 6 AM PHT = 22:00 UTC previous day
crons.daily(
  "branch-scoring",
  { hourUTC: 22, minuteUTC: 0 },
  internal.ai.branchScoring.generateBranchScores
);

// Daily trading calendar reminders — 8 AM PHT = 00:00 UTC
// Sends email alerts to admin/manager/hqStaff for events 7, 3, and 1 day ahead
crons.daily(
  "trading-calendar-reminders",
  { hourUTC: 0, minuteUTC: 0 },
  internal.analytics.tradingCalendarReminderJob.sendTradingReminders
);

// ─── Snapshot Generation ────────────────────────────────────────────────────
// Hourly snapshot — computes branchDailySnapshots + variantDailySnapshots.
// Runs every hour so dashboards always have fresh data. Idempotent per date.
// Must run BEFORE restock/scoring crons that depend on snapshot data.
crons.interval(
  "snapshot-generation",
  { hours: 1 },
  _internal.snapshots.generate.orchestrate
);

// ─── Email Digest Crons ─────────────────────────────────────────────────────

// Daily low-stock email digest — 7 AM PHT = 23:00 UTC previous day
crons.daily(
  "low-stock-email-digest",
  { hourUTC: 23, minuteUTC: 0 },
  _internal.notifications.emailDigests.sendLowStockDigest
);

// Daily restock suggestions email — 5:30 AM PHT = 21:30 UTC previous day
// Runs 30 min after restock generation to ensure data is fresh
crons.daily(
  "restock-email-digest",
  { hourUTC: 21, minuteUTC: 30 },
  _internal.notifications.emailDigests.sendRestockDigest
);

// Daily branch performance scores email — 6:30 AM PHT = 22:30 UTC previous day
// Runs 30 min after branch scoring to ensure data is ready
crons.daily(
  "branch-scores-email-digest",
  { hourUTC: 22, minuteUTC: 30 },
  _internal.notifications.emailDigests.sendBranchScoresDigest
);

// Weekly demand summary email — Monday 6:30 AM PHT = Sunday 22:30 UTC
// Runs 30 min after demand summary generation
crons.weekly(
  "demand-email-digest",
  { dayOfWeek: "sunday", hourUTC: 22, minuteUTC: 30 },
  _internal.notifications.emailDigests.sendDemandDigest
);

export default crons;
