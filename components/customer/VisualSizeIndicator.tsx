"use client";

import { Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Philippine standard sizing data ─────────────────────────────────────────

const TOPS_SIZES: Record<string, { chest: number; length: number }> = {
  S:   { chest: 34, length: 26 },
  M:   { chest: 36, length: 27 },
  L:   { chest: 38, length: 28 },
  XL:  { chest: 40, length: 29 },
  "2XL": { chest: 44, length: 30 },
};

const BOTTOMS_SIZES: Record<string, { waist: number; inseam: number }> = {
  "28": { waist: 28, inseam: 30 },
  "30": { waist: 30, inseam: 30 },
  "32": { waist: 32, inseam: 31 },
  "34": { waist: 34, inseam: 31 },
  "36": { waist: 36, inseam: 32 },
  "38": { waist: 38, inseam: 32 },
};

const BOTTOMS_CATEGORIES = ["pants", "jeans", "shorts", "trousers", "joggers", "chinos"];

function isBottoms(category: string): boolean {
  return BOTTOMS_CATEGORIES.some((b) => category.toLowerCase().includes(b));
}

// ── SVG body silhouettes ────────────────────────────────────────────────────

function TopsSilhouette({ selectedSize }: { selectedSize: string | null }) {
  const data = selectedSize ? TOPS_SIZES[selectedSize] : null;
  const hasSelection = !!data;

  return (
    <svg viewBox="0 0 200 260" className="w-full max-w-[200px] mx-auto">
      {/* Body outline */}
      <path
        d="M100 20
           C90 20 85 30 85 40
           L85 45
           C70 48 55 55 45 65
           L30 90
           L40 100
           L55 85
           L55 180
           C55 190 60 195 70 195
           L130 195
           C140 195 145 190 145 180
           L145 85
           L160 100
           L170 90
           L155 65
           C145 55 130 48 115 45
           L115 40
           C115 30 110 20 100 20Z"
        fill="none"
        stroke="#555"
        strokeWidth="2"
        className="transition-colors duration-200"
      />

      {/* Head circle */}
      <circle cx="100" cy="14" r="10" fill="none" stroke="#555" strokeWidth="2" />

      {/* Chest measurement line */}
      <line
        x1="52" y1="95" x2="148" y2="95"
        stroke={hasSelection ? "#E8192C" : "#444"}
        strokeWidth={hasSelection ? 2 : 1}
        strokeDasharray={hasSelection ? "none" : "4 3"}
        className="transition-all duration-200"
      />
      <circle cx="52" cy="95" r="3" fill={hasSelection ? "#E8192C" : "#444"} />
      <circle cx="148" cy="95" r="3" fill={hasSelection ? "#E8192C" : "#444"} />

      {/* Chest label */}
      <text
        x="100" y="88"
        textAnchor="middle"
        className="text-[10px] fill-zinc-400"
        fontFamily="sans-serif"
      >
        Chest
      </text>
      {data && (
        <text
          x="100" y="110"
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill="#E8192C"
          fontFamily="sans-serif"
        >
          {data.chest}&quot;
        </text>
      )}

      {/* Length measurement line */}
      <line
        x1="160" y1="50" x2="160" y2="195"
        stroke={hasSelection ? "#E8192C" : "#444"}
        strokeWidth={hasSelection ? 2 : 1}
        strokeDasharray={hasSelection ? "none" : "4 3"}
        className="transition-all duration-200"
      />
      <line x1="157" y1="50" x2="163" y2="50" stroke={hasSelection ? "#E8192C" : "#444"} strokeWidth={hasSelection ? 2 : 1} />
      <line x1="157" y1="195" x2="163" y2="195" stroke={hasSelection ? "#E8192C" : "#444"} strokeWidth={hasSelection ? 2 : 1} />

      {/* Length label */}
      <text
        x="170" y="125"
        textAnchor="start"
        className="text-[10px] fill-zinc-400"
        fontFamily="sans-serif"
        transform="rotate(90 170 125)"
      >
        Length {data ? `${data.length}"` : ""}
      </text>
      {data && (
        <text
          x="175" y="145"
          textAnchor="start"
          className="text-[11px] font-semibold"
          fill="#E8192C"
          fontFamily="sans-serif"
        >
          {data.length}&quot;
        </text>
      )}
    </svg>
  );
}

function BottomsSilhouette({ selectedSize }: { selectedSize: string | null }) {
  const data = selectedSize ? BOTTOMS_SIZES[selectedSize] : null;
  const hasSelection = !!data;

  return (
    <svg viewBox="0 0 200 280" className="w-full max-w-[200px] mx-auto">
      {/* Pants outline */}
      <path
        d="M60 30
           L60 25
           C60 20 65 15 75 15
           L125 15
           C135 15 140 20 140 25
           L140 30
           L145 130
           C145 135 140 140 135 140
           L115 140
           L110 140
           L105 130
           L100 120
           L95 130
           L90 140
           L85 140
           L65 140
           C60 140 55 135 55 130
           L60 30Z"
        fill="none"
        stroke="#555"
        strokeWidth="2"
        className="transition-colors duration-200"
      />

      {/* Left leg */}
      <path
        d="M65 140 L60 260 L90 260 L90 140"
        fill="none"
        stroke="#555"
        strokeWidth="2"
      />

      {/* Right leg */}
      <path
        d="M110 140 L110 260 L140 260 L145 140"
        fill="none"
        stroke="#555"
        strokeWidth="2"
      />

      {/* Waist measurement line */}
      <line
        x1="55" y1="22" x2="145" y2="22"
        stroke={hasSelection ? "#E8192C" : "#444"}
        strokeWidth={hasSelection ? 2 : 1}
        strokeDasharray={hasSelection ? "none" : "4 3"}
        className="transition-all duration-200"
      />
      <circle cx="55" cy="22" r="3" fill={hasSelection ? "#E8192C" : "#444"} />
      <circle cx="145" cy="22" r="3" fill={hasSelection ? "#E8192C" : "#444"} />

      {/* Waist label */}
      <text
        x="100" y="12"
        textAnchor="middle"
        className="text-[10px] fill-zinc-400"
        fontFamily="sans-serif"
      >
        Waist
      </text>
      {data && (
        <text
          x="100" y="38"
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill="#E8192C"
          fontFamily="sans-serif"
        >
          {data.waist}&quot;
        </text>
      )}

      {/* Inseam measurement line (inner leg) */}
      <line
        x1="100" y1="120" x2="100" y2="260"
        stroke={hasSelection ? "#E8192C" : "#444"}
        strokeWidth={hasSelection ? 2 : 1}
        strokeDasharray={hasSelection ? "none" : "4 3"}
        className="transition-all duration-200"
      />
      <line x1="97" y1="120" x2="103" y2="120" stroke={hasSelection ? "#E8192C" : "#444"} strokeWidth={hasSelection ? 2 : 1} />
      <line x1="97" y1="260" x2="103" y2="260" stroke={hasSelection ? "#E8192C" : "#444"} strokeWidth={hasSelection ? 2 : 1} />

      {/* Inseam label */}
      <text
        x="30" y="195"
        textAnchor="middle"
        className="text-[10px] fill-zinc-400"
        fontFamily="sans-serif"
      >
        Inseam
      </text>
      {data && (
        <text
          x="30" y="210"
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill="#E8192C"
          fontFamily="sans-serif"
        >
          {data.inseam}&quot;
        </text>
      )}
    </svg>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

interface VisualSizeIndicatorProps {
  category: string;
  selectedSize: string | null;
}

export function VisualSizeIndicator({ category, selectedSize }: VisualSizeIndicatorProps) {
  const bottoms = isBottoms(category);
  const sizeData = bottoms ? BOTTOMS_SIZES : TOPS_SIZES;
  const availableSizes = Object.keys(sizeData);
  const currentData = selectedSize
    ? bottoms
      ? BOTTOMS_SIZES[selectedSize]
      : TOPS_SIZES[selectedSize]
    : null;

  return (
    <div className="rounded-xl border border-border bg-[#0A0A0A] p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Ruler className="h-4 w-4 text-[#E8192C]" />
        <h3 className="text-sm font-semibold text-white">Visual Size Guide</h3>
      </div>

      {/* Size chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {availableSizes.map((size) => (
          <span
            key={size}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              selectedSize === size
                ? "bg-[#E8192C] text-white"
                : "bg-zinc-800 text-zinc-400",
            )}
          >
            {size}
          </span>
        ))}
      </div>

      {/* SVG silhouette */}
      <div className="py-2">
        {bottoms ? (
          <BottomsSilhouette selectedSize={selectedSize} />
        ) : (
          <TopsSilhouette selectedSize={selectedSize} />
        )}
      </div>

      {/* Measurement summary */}
      {currentData && (
        <div className="mt-3 rounded-lg bg-zinc-900/60 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-[#E8192C] uppercase tracking-wider">
            Size {selectedSize} Measurements
          </p>
          {bottoms ? (
            <>
              <MeasurementRow label="Waist" value={`${(currentData as { waist: number; inseam: number }).waist}"`} />
              <MeasurementRow label="Inseam" value={`${(currentData as { waist: number; inseam: number }).inseam}"`} />
            </>
          ) : (
            <>
              <MeasurementRow label="Chest" value={`${(currentData as { chest: number; length: number }).chest}"`} />
              <MeasurementRow label="Length" value={`${(currentData as { chest: number; length: number }).length}"`} />
            </>
          )}
        </div>
      )}

      {!selectedSize && (
        <p className="mt-3 text-center text-xs text-zinc-500">
          Select a size above to see measurements
        </p>
      )}
    </div>
  );
}

function MeasurementRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
