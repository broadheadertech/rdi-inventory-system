"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const IMPACT_DOT: Record<string, string> = {
  very_high: "bg-red-500",
  high:      "bg-amber-500",
  medium:    "bg-yellow-500",
  low:       "bg-gray-400",
};

const CATEGORY_COLOR: Record<string, string> = {
  Holiday:     "bg-blue-100 text-blue-800",
  Season:      "bg-green-100 text-green-800",
  Event:       "bg-purple-100 text-purple-800",
  "Sale Event": "bg-red-100 text-red-800",
  Payday:      "bg-emerald-100 text-emerald-800",
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  promotion: "bg-orange-100 text-orange-800",
  event:     "bg-violet-100 text-violet-800",
  closure:   "bg-red-100 text-red-800",
  note:      "bg-gray-100 text-gray-700",
};

const EVENT_TYPE_DOT: Record<string, string> = {
  promotion: "bg-orange-500",
  event:     "bg-violet-500",
  closure:   "bg-red-600",
  note:      "bg-gray-400",
};

const EVENT_TYPE_OPTIONS = [
  { value: "promotion", label: "Promotion" },
  { value: "event",     label: "Event" },
  { value: "closure",   label: "Closure" },
  { value: "note",      label: "Note" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(centavos: number): string {
  if (centavos === 0) return "—";
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtFull(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toYYYYMMDD(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function parseYYYYMMDD(s: string): { year: number; month: number; day: number } {
  return { year: +s.slice(0, 4), month: +s.slice(4, 6), day: +s.slice(6, 8) };
}

function formatDate(yyyymmdd: string): string {
  const { year, month, day } = parseYYYYMMDD(yyyymmdd);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function todayYYYYMMDD(): string {
  const now = new Date();
  return toYYYYMMDD(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// Revenue intensity class — subtle green tint for high-revenue days
function revenueIntensity(rev: number, max: number): string {
  if (rev === 0 || max === 0) return "";
  const ratio = rev / max;
  if (ratio >= 0.75) return "bg-green-50 ring-1 ring-green-200";
  if (ratio >= 0.40) return "bg-green-50/60";
  return "";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function TradingCalendarPage() {
  const today = todayYYYYMMDD();
  const nowYear  = +today.slice(0, 4);
  const nowMonth = +today.slice(4, 6);

  const [year,  setYear]  = useState(nowYear);
  const [month, setMonth] = useState(nowMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

  // Add-event form state
  const [showForm, setShowForm]     = useState(false);
  const [formName, setFormName]     = useState("");
  const [formType, setFormType]     = useState<"promotion" | "event" | "closure" | "note">("event");
  const [formNotes, setFormNotes]   = useState("");
  const [saving, setSaving]         = useState(false);

  const calendarData = useQuery(api.analytics.tradingCalendar.getCalendarMonth, { year, month });
  const createEvent  = useMutation(api.analytics.tradingCalendar.createTradingEvent);
  const deleteEvent  = useMutation(api.analytics.tradingCalendar.deleteTradingEvent);

  // ── Navigation ──────────────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  function goToday() {
    setYear(nowYear); setMonth(nowMonth); setSelectedDate(today);
  }

  // ── Calendar grid ───────────────────────────────────────────────────────────

  const gridCells = useMemo(() => {
    if (!calendarData) return [];
    const offset = calendarData.firstDayOfWeek; // 0=Sun
    const blanks = Array.from({ length: offset }, (_, i) => ({ type: "blank" as const, key: `blank-${i}` }));
    const dayItems = calendarData.days.map((d) => ({ type: "day" as const, data: d }));
    return [...blanks, ...dayItems];
  }, [calendarData]);

  // ── Selected day ────────────────────────────────────────────────────────────

  const selectedDay = useMemo(() => {
    if (!selectedDate || !calendarData) return null;
    return calendarData.days.find((d) => d.date === selectedDate) ?? null;
  }, [selectedDate, calendarData]);

  // ── Add event ───────────────────────────────────────────────────────────────

  async function handleAddEvent() {
    if (!selectedDate || !formName.trim()) return;
    setSaving(true);
    try {
      await createEvent({
        date: selectedDate,
        name: formName.trim(),
        type: formType,
        notes: formNotes.trim() || undefined,
      });
      setFormName(""); setFormNotes(""); setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    await deleteEvent({ id: id as Id<"tradingEvents"> });
  }

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (!calendarData) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 min-h-0">

      {/* ── Calendar column ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Trading Calendar</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Today
            </button>
            <button onClick={prevMonth} className="rounded-md border p-1.5 hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-base font-semibold w-40 text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button onClick={nextMonth} className="rounded-md border p-1.5 hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Month total */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Month total: <span className="font-semibold text-foreground">{fmtFull(calendarData.totalRevenueCentavos)}</span></span>
          <span className="text-xs">·</span>
          <span className="flex items-center gap-3 flex-wrap">
            {[
              { dot: "bg-red-500",    label: "Very High demand" },
              { dot: "bg-amber-500",  label: "High demand" },
              { dot: "bg-yellow-500", label: "Medium demand" },
              { dot: "bg-orange-500", label: "Promotion" },
              { dot: "bg-violet-500", label: "Event" },
              { dot: "bg-red-600",    label: "Closure" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span className={cn("h-2 w-2 rounded-full", l.dot)} />
                <span className="text-xs">{l.label}</span>
              </span>
            ))}
          </span>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-1">
          {DAY_HEADERS.map((h) => (
            <div key={h} className="text-center text-xs font-semibold text-muted-foreground pb-1">
              {h}
            </div>
          ))}

          {/* Day cells */}
          {gridCells.map((cell) => {
            if (cell.type === "blank") {
              return <div key={cell.key} />;
            }
            const { data } = cell;
            const isToday    = data.date === today;
            const isSelected = data.date === selectedDate;
            const hasRevenue = data.revenueCentavos > 0;
            const intensity  = revenueIntensity(data.revenueCentavos, calendarData.maxDayRevenueCentavos);
            const allDots = [
              ...data.staticEvents.map((e) => IMPACT_DOT[e.demandImpact] ?? "bg-gray-400"),
              ...data.customEvents.map((e) => EVENT_TYPE_DOT[e.type] ?? "bg-gray-400"),
            ].slice(0, 5); // max 5 dots

            return (
              <button
                key={data.date}
                onClick={() => setSelectedDate(data.date === selectedDate ? null : data.date)}
                className={cn(
                  "relative flex flex-col rounded-lg border p-2 text-left transition-all min-h-[5.5rem]",
                  "hover:border-primary/40 hover:shadow-sm",
                  isSelected
                    ? "border-primary bg-primary/5 shadow"
                    : isToday
                    ? "border-primary/60 bg-primary/3"
                    : intensity || "border-transparent bg-muted/20",
                  !isSelected && !isToday && "hover:bg-muted/40"
                )}
              >
                {/* Date number */}
                <span className={cn(
                  "text-xs font-semibold leading-none",
                  isToday ? "text-primary" : "text-foreground"
                )}>
                  {isToday && (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {data.day}
                    </span>
                  )}
                  {!isToday && data.day}
                </span>

                {/* Revenue */}
                {hasRevenue && (
                  <span className="mt-1 text-[10px] font-medium text-green-700 leading-none">
                    {fmt(data.revenueCentavos)}
                  </span>
                )}

                {/* Event dots */}
                {allDots.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-0.5 pt-1">
                    {allDots.map((dot, i) => (
                      <span key={i} className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Detail panel ────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 space-y-4">

        {selectedDay ? (
          <>
            {/* Selected day header */}
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Selected Day</p>
              <p className="text-sm font-bold leading-snug">{formatDate(selectedDay.date)}</p>
              <div className="flex gap-4 mt-2">
                <div>
                  <p className="text-xs text-muted-foreground">Sales</p>
                  <p className="text-lg font-bold text-green-700">{fmtFull(selectedDay.revenueCentavos)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                  <p className="text-lg font-bold">{selectedDay.transactionCount}</p>
                </div>
              </div>
            </div>

            {/* Static events */}
            {selectedDay.staticEvents.length > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PH Events</p>
                {selectedDay.staticEvents.map((ev, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium leading-snug">{ev.name}</p>
                      <span className={cn("inline-flex mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium", CATEGORY_COLOR[ev.category] ?? "bg-gray-100 text-gray-700")}>
                        {ev.category}
                      </span>
                    </div>
                    <span className={cn("h-2 w-2 rounded-full shrink-0 mt-1.5", IMPACT_DOT[ev.demandImpact])} title={ev.demandImpact} />
                  </div>
                ))}
              </div>
            )}

            {/* Custom events */}
            {selectedDay.customEvents.length > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Events</p>
                {selectedDay.customEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start justify-between gap-2 group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">{ev.name}</p>
                      <span className={cn("inline-flex mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize", EVENT_TYPE_COLOR[ev.type] ?? "bg-gray-100 text-gray-700")}>
                        {ev.type}
                      </span>
                      {ev.notes && <p className="text-xs text-muted-foreground mt-1">{ev.notes}</p>}
                    </div>
                    <button
                      onClick={() => handleDeleteEvent(ev.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove event"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add event */}
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Event
              </button>
            ) : (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Event</p>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Event name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />

                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as typeof formType)}
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {EVENT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  <textarea
                    placeholder="Notes (optional)"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                </div>

                <button
                  onClick={handleAddEvent}
                  disabled={!formName.trim() || saving}
                  className="w-full rounded-md bg-primary py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save Event"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border bg-card p-6 text-center space-y-2">
            <CalendarDays className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">Select a day to view events and revenue details.</p>
          </div>
        )}

        {/* Legend card */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event Types</p>
          <div className="space-y-1.5">
            {[
              { dot: "bg-blue-500",   label: "PH Holiday" },
              { dot: "bg-green-500",  label: "Seasonal" },
              { dot: "bg-red-500",    label: "Sale Event" },
              { dot: "bg-emerald-500",label: "Payday" },
              { dot: "bg-orange-500", label: "Promotion" },
              { dot: "bg-violet-500", label: "Custom Event" },
              { dot: "bg-red-600",    label: "Closure" },
              { dot: "bg-gray-400",   label: "Note" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full shrink-0", l.dot)} />
                <span className="text-xs text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Demand Impact</p>
            {[
              { dot: "bg-red-500",    label: "Very High" },
              { dot: "bg-amber-500",  label: "High" },
              { dot: "bg-yellow-500", label: "Medium" },
              { dot: "bg-gray-400",   label: "Low" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full shrink-0", l.dot)} />
                <span className="text-xs text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
