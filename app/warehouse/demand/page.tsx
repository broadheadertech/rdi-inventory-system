"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Date helpers (vanilla JS — no date-fns) ──────────────────────────────────

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function toInputDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function fromInputDate(yyyy_mm_dd: string): string {
  return yyyy_mm_dd.replace(/-/g, "");
}

function dateToMs(yyyymmdd: string): number {
  const y = parseInt(yyyymmdd.slice(0, 4));
  const m = parseInt(yyyymmdd.slice(4, 6)) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8));
  return Date.UTC(y, m, d, 0, 0, 0) - 8 * 60 * 60 * 1000; // PHT midnight → UTC ms
}

function getPresetDates(
  preset: "today" | "yesterday" | "thisWeek" | "thisMonth"
): { start: string; end: string } {
  const now = new Date();
  const today = toYYYYMMDD(now);

  if (preset === "today") return { start: today, end: today };

  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { start: toYYYYMMDD(y), end: toYYYYMMDD(y) };
  }

  if (preset === "thisWeek") {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { start: toYYYYMMDD(weekStart), end: today };
  }

  // thisMonth
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toYYYYMMDD(monthStart), end: today };
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Preset = "today" | "yesterday" | "thisWeek" | "thisMonth" | "custom";

export default function HqDemandPage() {
  const [dateStart, setDateStart] = useState(() => getPresetDates("thisMonth").start);
  const [dateEnd, setDateEnd] = useState(() => getPresetDates("thisMonth").end);
  const [activePreset, setActivePreset] = useState<Preset>("thisMonth");
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [brandFilter, setBrandFilter] = useState("");

  function applyPreset(preset: "today" | "yesterday" | "thisWeek" | "thisMonth") {
    const { start, end } = getPresetDates(preset);
    setDateStart(start);
    setDateEnd(end);
    setActivePreset(preset);
  }

  // Convert YYYYMMDD to ms for Convex queries
  const startMs = dateToMs(dateStart);
  const endMs = dateToMs(dateEnd) + 86_400_000 - 1; // inclusive end-of-day

  // ─── Queries ──────────────────────────────────────────────────────────
  const metrics = useQuery(
    api.dashboards.demandIntelligence.getDemandMetrics,
    { dateStart: startMs, dateEnd: endMs }
  );
  const topBrands = useQuery(
    api.dashboards.demandIntelligence.getTopDemandedBrands,
    { dateStart: startMs, dateEnd: endMs }
  );
  const trendData = useQuery(
    api.dashboards.demandIntelligence.getDemandTrendByDay,
    { dateStart: startMs, dateEnd: endMs }
  );
  const entries = useQuery(
    api.dashboards.demandIntelligence.getDemandEntries,
    {
      dateStart: startMs,
      dateEnd: endMs,
      branchId: branchId ? (branchId as Id<"branches">) : undefined,
      brand: brandFilter || undefined,
      limit: 50,
    }
  );
  const allBranches = useQuery(api.dashboards.birReports.listActiveBranches);

  const pagination = usePagination(entries);

  // ─── Presets ──────────────────────────────────────────────────────────
  const presets: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "thisWeek", label: "This Week" },
    { key: "thisMonth", label: "This Month" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Demand Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Track what customers are asking for across all branches.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-lg border p-4 space-y-3">
        {/* Date presets */}
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key as "today" | "yesterday" | "thisWeek" | "thisMonth")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activePreset === p.key
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date range + branch + brand filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="date"
              value={toInputDate(dateStart)}
              onChange={(e) => {
                setDateStart(fromInputDate(e.target.value));
                setActivePreset("custom");
              }}
              className="rounded-md border px-2 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={toInputDate(dateEnd)}
              onChange={(e) => {
                setDateEnd(fromInputDate(e.target.value));
                setActivePreset("custom");
              }}
              className="rounded-md border px-2 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Branch</label>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value || undefined)}
              className="rounded-md border px-2 py-1.5 text-sm"
            >
              <option value="">All Branches</option>
              {allBranches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Brand</label>
            <input
              type="text"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              placeholder="Filter brand…"
              className="rounded-md border px-2 py-1.5 text-sm w-36"
            />
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="Total Entries"
          value={metrics?.totalEntries}
        />
        <MetricCard
          label="Unique Brands"
          value={metrics?.uniqueBrands}
        />
        <MetricCard
          label="Top Brand"
          value={
            metrics?.topBrand
              ? `${metrics.topBrand.brand} (${metrics.topBrand.count})`
              : "—"
          }
        />
        <MetricCard
          label="Trending Items"
          value={metrics?.trendingCount}
          highlight={!!metrics?.trendingCount && metrics.trendingCount > 0}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar chart — Top Demanded Brands */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 text-sm font-semibold">Top Demanded Brands</h2>
          {topBrands === undefined ? (
            <div className="h-[300px] animate-pulse rounded bg-muted" />
          ) : topBrands.length === 0 ? (
            <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              No demand data for this period.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topBrands}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="brand" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Line chart — Daily Demand Trend */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 text-sm font-semibold">Daily Demand Trend</h2>
          {trendData === undefined ? (
            <div className="h-[300px] animate-pulse rounded bg-muted" />
          ) : trendData.length === 0 ? (
            <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              No demand data for this period.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Demand Entries Table */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-sm font-semibold">Demand Entries</h2>
        {entries === undefined ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No demand entries for this period.
          </p>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Brand</th>
                  <th className="pb-2 font-medium">Design</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 font-medium">By</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedData.map((entry) => (
                  <tr key={entry._id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{entry.brand}</td>
                    <td className="py-2 text-muted-foreground">
                      {entry.design ?? "—"}
                    </td>
                    <td className="py-2">{entry.size ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">
                      {entry.branchName}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {entry.loggedByName}
                    </td>
                    <td className="py-2">
                      {entry.isTrending ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          Trending
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Logged
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">
                      {relativeTime(entry.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            hasNextPage={pagination.hasNextPage}
            hasPrevPage={pagination.hasPrevPage}
            onNextPage={pagination.nextPage}
            onPrevPage={pagination.prevPage}
            noun="entry"
          />
          </>
        )}
      </div>
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number | undefined | null;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value === undefined ? (
        <div className="mt-1 h-7 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <p
          className={`mt-1 text-2xl font-bold ${
            highlight ? "text-amber-600 dark:text-amber-400" : ""
          }`}
        >
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}
