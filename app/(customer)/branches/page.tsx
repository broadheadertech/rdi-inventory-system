"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MapPin, Phone, Navigation2, Locate } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Haversine Distance (km) ────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Open/Closed Status ─────────────────────────────────────────────────────

function isBranchOpen(
  businessHours: { openTime: string; closeTime: string } | undefined,
  timezone?: string
): { isOpen: boolean; label: string } | null {
  if (!businessHours) return null;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone ?? "Asia/Manila",
  });
  const currentTime = formatter.format(now);

  let isOpen: boolean;
  if (businessHours.openTime <= businessHours.closeTime) {
    // Normal hours (e.g., 09:00–21:00)
    isOpen = currentTime >= businessHours.openTime && currentTime < businessHours.closeTime;
  } else {
    // Overnight hours (e.g., 22:00–06:00)
    isOpen = currentTime >= businessHours.openTime || currentTime < businessHours.closeTime;
  }
  return { isOpen, label: isOpen ? "Open" : "Closed" };
}

// ─── Geolocation Hook ───────────────────────────────────────────────────────

function useGeolocation() {
  const [position, setPosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  return { position, error, loading, requestLocation };
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function BranchFinderPage() {
  const branches = useQuery(api.catalog.publicBrowse.listActiveBranchesPublic);
  const { position, error: geoError, loading: geoLoading, requestLocation } =
    useGeolocation();

  const sortedBranches = useMemo(() => {
    if (!branches) return undefined;
    if (!position) return branches;

    return [...branches]
      .map((b) => ({
        ...b,
        distance:
          b.latitude != null && b.longitude != null
            ? haversineKm(position.lat, position.lng, b.latitude, b.longitude)
            : null,
      }))
      .sort((a, b) => {
        if (a.distance != null && b.distance != null)
          return a.distance - b.distance;
        if (a.distance != null) return -1;
        if (b.distance != null) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [branches, position]);

  // Loading skeleton
  if (branches === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-5 w-72 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-lg border bg-muted"
            />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (branches.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-bold">Find a Branch</h1>
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">
            No branches available
          </p>
        </div>
      </div>
    );
  }

  const displayBranches = sortedBranches ?? branches;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Find a Branch</h1>
          <p className="text-sm text-muted-foreground">
            {branches.length} branch{branches.length !== 1 ? "es" : ""} near you
          </p>
        </div>

        {/* Geolocation button */}
        {!position && (
          <button
            type="button"
            onClick={requestLocation}
            disabled={geoLoading}
            className="flex min-h-[44px] items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            <Locate className="h-4 w-4" />
            {geoLoading ? "Locating..." : "Enable location to sort by nearest"}
          </button>
        )}
        {position && (
          <p className="text-sm text-muted-foreground">
            Sorted by distance from you
          </p>
        )}
        {geoError && !position && (
          <p className="text-xs text-destructive">
            Location unavailable: {geoError}
          </p>
        )}
      </div>

      {/* Branch cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayBranches.map((branch) => {
          const status = isBranchOpen(
            branch.businessHours,
            branch.timezone
          );
          const distance: number | null =
            "distance" in branch ? (branch as { distance: number | null }).distance : null;

          const directionsUrl =
            branch.latitude != null && branch.longitude != null
              ? `https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`;

          return (
            <article
              key={branch._id}
              className="flex flex-col rounded-lg border p-4 space-y-2"
            >
              {/* Name + status */}
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{branch.name}</h2>
                {status && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      status.isOpen
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    )}
                    aria-label={`Branch is ${status.label}`}
                  >
                    {status.label}
                  </span>
                )}
              </div>

              {/* Address */}
              <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{branch.address}</span>
              </div>

              {/* Phone */}
              {branch.phone && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <a
                    href={`tel:${branch.phone}`}
                    className="hover:text-primary"
                  >
                    {branch.phone}
                  </a>
                </div>
              )}

              {/* Distance */}
              {distance != null && (
                <p className="text-sm text-muted-foreground">
                  {distance < 1
                    ? `${Math.round(distance * 1000)} m away`
                    : `${distance.toFixed(1)} km away`}
                </p>
              )}

              {/* Business hours info */}
              {branch.businessHours && (
                <p className="text-xs text-muted-foreground">
                  Hours: {branch.businessHours.openTime} – {branch.businessHours.closeTime}
                </p>
              )}

              {/* Get Directions */}
              <div className="pt-1">
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Navigation2 className="h-4 w-4" />
                  Get Directions
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
