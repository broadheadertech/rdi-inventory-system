"use client";

// components/shared/ProductQrLabels.tsx — printable QR labels for products.
//
// The QR holds the SKU and nothing else. Every scan surface in RDI resolves a
// code by barcode first and by SKU second, and the camera scanner already
// accepts QR_CODE, so a label made here works at the POS, at goods receipt, at
// packing and at box receiving without a line of scanning code changing. It
// also stays readable to a person, which a URL or an opaque id would not.
//
// Two things matter for a label that has to survive a warehouse:
//
//   The quiet zone travels with the image. Every SKU in the catalogue fits a
//   version-2 QR at 25x25 modules, and the four-module margin is generated
//   INTO the SVG rather than applied as CSS padding, so no later layout change
//   can crop it and quietly break scanning.
//
//   The QR never shrinks below 18mm. At 25 modules plus the quiet zone that is
//   0.62mm per module; below roughly half a millimetre a laser print stops
//   reading reliably on a handheld.
//
// SVG rather than canvas, because a label is printed: a canvas would render at
// screen resolution and come out soft at 300dpi.

import { useEffect, useMemo, useState } from "react";

export type LabelLayout = "tag" | "tagPrice" | "minimal";

export const LAYOUTS: {
  value: LabelLayout;
  label: string;
  hint: string;
  /** Millimetres, as printed. */
  width: number;
  height: number;
  qrMm: number;
}[] = [
  {
    value: "tag",
    label: "Tag · no price",
    hint: "QR, product, size and colour, SKU. A price change never makes it stale.",
    width: 50,
    height: 25,
    qrMm: 20,
  },
  {
    value: "tagPrice",
    label: "Tag · with price",
    hint: "The same plus the price. Every approved price change makes printed tags wrong.",
    width: 50,
    height: 30,
    qrMm: 20,
  },
  {
    value: "minimal",
    label: "QR and SKU only",
    hint: "Smallest. For a polybag or carton where the product is already obvious.",
    width: 30,
    height: 20,
    qrMm: 18,
  },
];

export type LabelRow = {
  variantId: string;
  sku: string;
  productName: string;
  size: string;
  color: string;
  brandName: string | null;
  priceCentavos: number;
  hasBranchOverride: boolean;
};

function pesos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * One QR as an inline SVG.
 *
 * qrcode is loaded on demand: it is only needed once somebody opens a label
 * sheet, and keeping it out of the main bundle costs nothing here.
 */
function Qr({ text, sizeMm }: { text: string; sizeMm: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const out = await QRCode.toString(text, {
          type: "svg",
          errorCorrectionLevel: "M",
          // The quiet zone the spec asks for, generated into the image so a
          // layout change cannot crop it away.
          margin: 4,
        });
        if (!cancelled) setSvg(out);
      } catch {
        if (!cancelled) setSvg(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!svg) {
    return (
      <div
        style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
        className="shrink-0 bg-muted"
        aria-hidden
      />
    );
  }

  return (
    <div
      style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
      className="shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      // The SVG is produced locally by qrcode from a SKU this app fetched;
      // nothing user-supplied reaches it.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function Label({
  row,
  layout,
  showPrice,
}: {
  row: LabelRow;
  layout: (typeof LAYOUTS)[number];
  showPrice: boolean;
}) {
  const minimal = layout.value === "minimal";

  return (
    <div
      className="label flex items-center gap-[1.5mm] overflow-hidden border border-dashed border-gray-300 bg-white p-[1.5mm]"
      style={{ width: `${layout.width}mm`, height: `${layout.height}mm` }}
    >
      <Qr text={row.sku} sizeMm={layout.qrMm} />
      <div className="min-w-0 flex-1 leading-tight">
        {minimal ? (
          <p className="break-all font-mono text-[5pt] text-black">{row.sku}</p>
        ) : (
          <>
            <p className="truncate text-[7pt] font-semibold text-black">
              {row.productName}
            </p>
            <p className="truncate text-[6pt] text-gray-700">
              {[row.size, row.color].filter(Boolean).join(" / ") || "—"}
            </p>
            <p className="break-all font-mono text-[5pt] text-gray-600">{row.sku}</p>
            {showPrice && (
              <p className="mt-[0.5mm] text-[8pt] font-bold text-black">
                {pesos(row.priceCentavos)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ProductQrLabels({
  rows,
  layout,
  copies,
}: {
  rows: LabelRow[];
  layout: LabelLayout;
  /** How many of each label to lay out. */
  copies: number;
}) {
  const spec = useMemo(
    () => LAYOUTS.find((l) => l.value === layout) ?? LAYOUTS[0],
    [layout]
  );
  const showPrice = layout === "tagPrice";

  const sheet = useMemo(() => {
    const out: LabelRow[] = [];
    for (const row of rows) {
      for (let i = 0; i < Math.max(1, copies); i++) out.push(row);
    }
    return out;
  }, [rows, copies]);

  return (
    <>
      {/*
        Print rules. The screen shows a preview inside the app chrome; the
        printer must get the labels and nothing else, at their true
        millimetre size, with no label split across a page break.
      */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #qr-label-sheet,
          #qr-label-sheet * {
            visibility: visible;
          }
          #qr-label-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            gap: 0;
          }
          #qr-label-sheet .label {
            border: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          @page {
            margin: 8mm;
          }
        }
      `}</style>

      <div
        id="qr-label-sheet"
        className="flex flex-wrap content-start gap-[2mm] bg-white p-[2mm]"
      >
        {sheet.map((row, index) => (
          <Label
            key={`${row.variantId}-${index}`}
            row={row}
            layout={spec}
            showPrice={showPrice}
          />
        ))}
      </div>
    </>
  );
}
