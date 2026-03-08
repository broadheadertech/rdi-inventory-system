"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface BranchWithCoords {
  _id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface NearestBranchResult {
  nearestBranch: BranchWithCoords | null;
  distanceKm: number | null;
  isLoading: boolean;
  error: string | null;
}

/** Haversine formula — returns distance in kilometres. */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useNearestBranch(): NearestBranchResult {
  const branches = useQuery(api.storefront.branches.getRetailBranches);

  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(true);

  // Prevent re-requesting geolocation on every render
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation not supported");
      setGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
      },
      () => {
        // User denied or error — graceful degradation
        setGeoError("denied");
        setGeoLoading(false);
      },
      { timeout: 10_000, maximumAge: 300_000 }, // cache for 5 min
    );
  }, []);

  // Derive nearest branch
  if (geoLoading || branches === undefined) {
    return { nearestBranch: null, distanceKm: null, isLoading: true, error: null };
  }

  if (geoError || !position) {
    return { nearestBranch: null, distanceKm: null, isLoading: false, error: geoError };
  }

  const withCoords: BranchWithCoords[] = (branches ?? [])
    .filter((b) => b.latitude !== null && b.longitude !== null)
    .map((b) => ({
      _id: b._id as string,
      name: b.name,
      address: b.address,
      latitude: b.latitude as number,
      longitude: b.longitude as number,
    }));

  if (withCoords.length === 0) {
    return { nearestBranch: null, distanceKm: null, isLoading: false, error: null };
  }

  let nearest = withCoords[0];
  let minDist = haversineKm(
    position.lat,
    position.lng,
    nearest.latitude,
    nearest.longitude,
  );

  for (let i = 1; i < withCoords.length; i++) {
    const d = haversineKm(
      position.lat,
      position.lng,
      withCoords[i].latitude,
      withCoords[i].longitude,
    );
    if (d < minDist) {
      minDist = d;
      nearest = withCoords[i];
    }
  }

  return {
    nearestBranch: nearest,
    distanceKm: Math.round(minDist * 10) / 10, // 1 decimal place
    isLoading: false,
    error: null,
  };
}
