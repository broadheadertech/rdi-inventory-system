"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Calendar,
  Tag,
  Clock,
  CloudRain,
  Sun,
  Wind,
  Thermometer,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

const IMPACT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  very_high: { bg: "bg-red-100", text: "text-red-800", label: "Very High" },
  high: { bg: "bg-amber-100", text: "text-amber-800", label: "High" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Medium" },
  low: { bg: "bg-gray-100", text: "text-gray-600", label: "Low" },
};

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-5 animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-5 w-1/2 bg-muted rounded" />
        <div className="h-5 w-16 bg-muted rounded-full" />
      </div>
      <div className="h-4 w-1/3 bg-muted rounded" />
      <div className="flex gap-2 mt-2">
        <div className="h-6 w-20 bg-muted rounded-full" />
        <div className="h-6 w-20 bg-muted rounded-full" />
      </div>
      <div className="h-10 bg-muted rounded mt-2" />
    </div>
  );
}

const SEVERITY_STYLES: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  critical: {
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-200",
    label: "Critical",
  },
  high: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    border: "border-orange-200",
    label: "High",
  },
  medium: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-yellow-200",
    label: "Medium",
  },
  low: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-200",
    label: "Low",
  },
};

function getAlertIcon(type: string) {
  switch (type) {
    case "typhoon_season":
      return <CloudRain className="h-5 w-5" />;
    case "flooding":
      return <CloudRain className="h-5 w-5" />;
    case "cool_weather":
      return <Thermometer className="h-5 w-5" />;
    case "heat_wave":
      return <Sun className="h-5 w-5" />;
    case "summer_travel":
      return <Sun className="h-5 w-5" />;
    default:
      return <Wind className="h-5 w-5" />;
  }
}

export default function HolidayForecastPage() {
  const holidays = useQuery(api.analytics.holidayForecast.getUpcomingHolidays);
  const weather = useQuery(api.analytics.holidayForecast.getWeatherAlerts);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Calendar className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold">Holiday & Event Forecast</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Upcoming Philippine holidays and events with expected demand impact
        </p>
      </div>

      {/* Loading */}
      {holidays === undefined && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty */}
      {holidays !== undefined && holidays.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold">No upcoming events</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md">
            There are no upcoming holidays or events to display at this time.
          </p>
        </div>
      )}

      {/* Event Cards */}
      {holidays && holidays.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {holidays.map((event, idx) => {
            const impact = IMPACT_STYLES[event.demandImpact] ?? IMPACT_STYLES.low;

            return (
              <div
                key={`${event.name}-${event.date}-${idx}`}
                className="rounded-lg border bg-card p-5 space-y-3 hover:shadow-md transition-shadow"
              >
                {/* Name + Impact Badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-base">{event.name}</h3>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                      impact.bg,
                      impact.text
                    )}
                  >
                    {impact.label}
                  </span>
                </div>

                {/* Date + Days Until + Category */}
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {event.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {event.daysUntil === 0
                      ? "Today"
                      : event.daysUntil === 1
                        ? "Tomorrow"
                        : `${event.daysUntil} days`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    {event.category}
                  </span>
                </div>

                {/* Top Categories Pills */}
                {event.topCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {event.topCategories.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}

                {/* Recommendation */}
                <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
                  <p className="text-xs text-blue-700">{event.recommendation}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Weather Alerts Section ─────────────────────────────────────── */}
      <div className="border-t pt-6">
        <div className="flex items-center gap-2">
          <CloudRain className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold">
            Typhoon &amp; Weather-Driven Stocking
          </h2>
        </div>
        <p className="text-muted-foreground mt-1">
          Seasonal weather alerts and inventory recommendations for Philippine
          branches
        </p>
      </div>

      {/* Weather Loading */}
      {weather === undefined && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border bg-card p-5 animate-pulse space-y-3"
            >
              <div className="h-5 w-2/3 bg-muted rounded" />
              <div className="h-4 w-1/2 bg-muted rounded" />
              <div className="h-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {weather && (
        <>
          {/* Current Season Banner */}
          <div className="rounded-lg border bg-gradient-to-r from-blue-50 to-cyan-50 p-5">
            <div className="flex items-center gap-3">
              <Wind className="h-8 w-8 text-blue-600" />
              <div>
                <h3 className="font-semibold text-lg">{weather.season}</h3>
                <p className="text-sm text-muted-foreground">
                  Current season based on Philippine climate patterns
                </p>
              </div>
            </div>
          </div>

          {/* Season Alerts */}
          {weather.seasonAlerts.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {weather.seasonAlerts.map((alert) => {
                const sev =
                  SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.low;
                return (
                  <div
                    key={alert.type}
                    className={cn(
                      "rounded-lg border p-5 space-y-3",
                      sev.border
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={sev.text}>
                          {getAlertIcon(alert.type)}
                        </span>
                        <h3 className="font-semibold text-base">
                          {alert.message}
                        </h3>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                          sev.bg,
                          sev.text
                        )}
                      >
                        {sev.label}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Stocking Recommendations
                      </p>
                      <ul className="space-y-1">
                        {alert.recommendations.map((rec) => (
                          <li
                            key={rec}
                            className="text-sm flex items-start gap-2"
                          >
                            <span className="text-muted-foreground mt-0.5">
                              &bull;
                            </span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PAGASA Signal Alerts */}
          {weather.pagasaSignals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <h3 className="font-semibold text-lg">
                  Active PAGASA Signal Alerts
                </h3>
              </div>
              {weather.pagasaSignals.map((signal) => {
                const sev =
                  SEVERITY_STYLES[signal.severity] ?? SEVERITY_STYLES.medium;
                return (
                  <div
                    key={signal.signal}
                    className={cn(
                      "rounded-lg border-2 p-5 space-y-3",
                      sev.border,
                      sev.bg
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className={cn("h-5 w-5", sev.text)} />
                      <h4 className={cn("font-bold", sev.text)}>
                        {signal.label}
                      </h4>
                      <span className="text-sm text-muted-foreground">
                        &mdash; {signal.message}
                      </span>
                    </div>
                    <ul className="space-y-1 ml-7">
                      {signal.recommendations.map((rec) => (
                        <li
                          key={rec}
                          className="text-sm flex items-start gap-2"
                        >
                          <span className="text-muted-foreground mt-0.5">
                            &bull;
                          </span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {/* Signal Reference Guide (always shown) */}
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-base">
                PAGASA Signal Reference Guide
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {weather.allSignalDefinitions.map((signal) => {
                const sev =
                  SEVERITY_STYLES[signal.severity] ?? SEVERITY_STYLES.medium;
                return (
                  <div
                    key={signal.signal}
                    className={cn(
                      "rounded-md border p-3 space-y-2",
                      sev.border
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold",
                          sev.bg,
                          sev.text
                        )}
                      >
                        {signal.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {signal.message}
                    </p>
                    <ul className="space-y-0.5">
                      {signal.recommendations.map((rec) => (
                        <li key={rec} className="text-xs text-muted-foreground">
                          &bull; {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
