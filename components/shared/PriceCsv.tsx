"use client";

// components/shared/PriceCsv.tsx — prices out to a spreadsheet and back.
//
// Editing a few hundred prices one cell at a time is how mistakes happen, so
// the whole filtered list goes out as a CSV, gets edited wherever people
// actually work, and comes back.
//
// The file is read against what is in force now: a row that matches is counted
// as untouched and proposes nothing, so a file where two lines changed
// proposes two changes and not ten thousand. A branch cell left empty means
// "follow the Base SRP", which is how a branch price is taken away — so the
// download leaves inherited cells empty rather than writing the base price
// into them, and the file never claims a price that is not really set.

import { useRef, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";

const FIXED_COLUMNS = ["SKU", "Brand", "Product", "Size", "Color", "Base SRP", "Cost"];

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "");
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(",")
    )
    .join("\r\n");
}

/** A CSV line split on commas that are not inside quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * "1,299.50" and "1299.5" both mean 129950 centavos.
 *
 * A blank cell and an unreadable one mean very different things: blank asks for
 * the branch price to be removed, so a cell someone typed "n/a" or "TBC" into
 * must NOT be mistaken for blank — that would quietly put the branch back on
 * the Base SRP. Anything with content that is not a price is refused instead.
 */
function parsePrice(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const text = trimmed.replace(/[^0-9.\-]/g, "");
  if (text === "") return "invalid";
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return "invalid";
  return Math.round(value * 100);
}

export function PriceCsv({
  filters,
  branchIds,
  onProposed,
}: {
  filters: { search?: string; brandId?: Id<"brands">; ownPricesIn?: Id<"branches">[] };
  branchIds: Id<"branches">[];
  onProposed?: () => void;
}) {
  const convex = useConvex();
  const proposeFromCsv = useMutation(api.admin.prices.proposePricesFromCsv);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const data = await convex.query(api.admin.prices.exportPriceRows, {
        ...filters,
        branchIds,
      });
      if (data.rows.length === 0) {
        toast.message("Nothing matches the current filters.");
        return;
      }
      const header = [...FIXED_COLUMNS, ...data.branches];
      const body = data.rows.map((r) => [
        r.sku,
        r.brandName,
        r.styleName,
        r.size,
        r.color,
        (r.basePriceCentavos / 100).toFixed(2),
        r.costPriceCentavos === null ? "" : (r.costPriceCentavos / 100).toFixed(2),
        // Empty where the branch simply follows the Base SRP.
        ...r.prices.map((p) => (p === null ? "" : (p / 100).toFixed(2))),
      ]);

      const blob = new Blob([toCsv([header, ...body])], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prices-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      if (data.truncated) {
        toast.warning("Only the first rows were exported. Narrow the filters to get the rest.");
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        toast.error("That file has no rows under its header.");
        return;
      }

      const header = splitCsvLine(lines[0]);
      const skuAt = header.findIndex((h) => h.toLowerCase() === "sku");
      const baseAt = header.findIndex((h) => h.toLowerCase() === "base srp");
      if (skuAt === -1) {
        toast.error("No SKU column. Download the file again and edit that copy.");
        return;
      }
      // Anything past the fixed columns is a branch.
      const branchCols = header
        .map((name, index) => ({ name, index }))
        .filter(({ name }) => !FIXED_COLUMNS.some((f) => f.toLowerCase() === name.toLowerCase()));

      const rows = [];
      let badCells = 0;
      for (const line of lines.slice(1)) {
        const cells = splitCsvLine(line);
        const sku = cells[skuAt];
        if (!sku) continue;

        let basePriceCentavos: number | undefined;
        if (baseAt !== -1) {
          const parsed = parsePrice(cells[baseAt] ?? "");
          if (parsed === "invalid") badCells++;
          else if (parsed !== null) basePriceCentavos = parsed;
        }

        const branchPrices = [];
        for (const col of branchCols) {
          const parsed = parsePrice(cells[col.index] ?? "");
          if (parsed === "invalid") { badCells++; continue; }
          branchPrices.push({
            branchName: col.name,
            ...(parsed === null ? {} : { priceCentavos: parsed }),
          });
        }

        rows.push({
          sku,
          ...(basePriceCentavos !== undefined ? { basePriceCentavos } : {}),
          branchPrices,
        });
      }

      const result = await proposeFromCsv({ fileName: file.name, rows });

      if (result.changed === 0) {
        toast.message(
          `Nothing to change — all ${result.unchanged} prices already match.` +
            (result.problems.length ? ` ${result.problems.length} row(s) could not be read.` : "")
        );
      } else {
        toast.success(
          `${result.changed} price${result.changed === 1 ? "" : "s"} sent for approval · ` +
            `${result.unchanged} untouched` +
            (result.problems.length ? ` · ${result.problems.length} not read` : "")
        );
        onProposed?.();
      }
      if (badCells > 0) {
        toast.warning(`${badCells} cell(s) were not a usable price and were ignored.`);
      }
      for (const problem of result.problems.slice(0, 3)) {
        toast.warning(`${problem.sku}: ${problem.reason}`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void download()}>
        <Download className="mr-1.5 h-4 w-4" />
        Download CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        <Upload className="mr-1.5 h-4 w-4" />
        Upload CSV
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <span className="text-xs text-muted-foreground">
        Edit the downloaded file and upload it back. Only the prices you changed are
        proposed; an empty branch cell puts that branch back on the Base SRP.
      </span>
    </div>
  );
}
