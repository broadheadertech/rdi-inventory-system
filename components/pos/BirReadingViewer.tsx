"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Printer } from "lucide-react";
import { BirReadingStub, type BirReadingData } from "./BirReadingStub";

export function BirReadingViewer({
  readingType,
  date,
  shiftId,
  deviceToken,
}: {
  readingType: "X" | "Y" | "Z";
  date?: string;
  shiftId?: Id<"cashierShifts">;
  deviceToken?: string;
}) {
  const data = useQuery(api.pos.birReading.getBirReading, {
    readingType,
    ...(date ? { date } : {}),
    ...(shiftId ? { shiftId } : {}),
    ...(deviceToken ? { deviceToken } : {}),
  });

  if (data === undefined) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (data === null) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No reading data available.
      </p>
    );
  }

  return (
    <div>
      {/* Print isolation — only the stub prints */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #bir-print-area, #bir-print-area * { visibility: visible !important; }
          #bir-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <div className="flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="mb-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      <div id="bir-print-area" className="rounded-md border">
        <BirReadingStub data={data as BirReadingData} />
      </div>
    </div>
  );
}
