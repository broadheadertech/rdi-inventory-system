// convex/crons.ts — Scheduled background jobs

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

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

export default crons;
