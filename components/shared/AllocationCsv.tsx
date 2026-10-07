"use client";

// components/shared/AllocationCsv.tsx — a pre-allocated push, uploaded.
//
// The allocation itself is decided in a buy sheet. This takes that sheet and
// turns it into transfer requests, one per destination branch, all sitting at
// "requested" for logistics to approve. Nothing moves on upload.
//
// Two things the format has to get right. The template carries this chain's
// real branch names, because the upload matches on the name and guessing the
// spelling is how a season lands in the wrong store. And the rows that could
// not be used come back as a file of their own: a five-hundred-row push with
// eleven short lines is fixed by editing those eleven, not by hunting them
// through the original.

import { useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Download, Upload, X } from "lucide-react";

const COLUMNS = ["SKU", "Branch", "Quantity", "Notes"];

type Problem = { row: number; sku: string; branchName: string; reason: string };
type Result = {
  fileName: string;
  sourceName: string;
  rowsRead: number;
  created: { branchName: string; lines: number; units: number }[];
  totalUnits: number;
  problems: Problem[];
};

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
 * A quantity cell. Anything unreadable comes back as NaN rather than as zero,
 * so the server reports the row instead of silently allocating nothing — "1O"
 * with a letter O is a typo to be shown, not an empty line.
 */
function parseQuantity(raw: string): number {
  const text = raw.trim().replace(/[\s,]/g, "");
  if (text === "") return NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

function saveFile(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function AllocationCsv({ onUploaded }: { onUploaded?: () => void }) {
  const template = useQuery(api.transfers.allocations.getAllocationTemplate);
  const upload = useMutation(api.transfers.allocations.uploadAllocation);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function downloadTemplate() {
    if (!template) return;
    const skus = template.sampleSkus.length > 0 ? template.sampleSkus : ["SKU-HERE"];
    const branches =
      template.branchNames.length > 0 ? template.branchNames : ["Branch name"];

    // A worked example: the first two branches against the first SKUs, so the
    // shape is obvious without reading any instructions.
    const rows: (string | number)[][] = [COLUMNS];
    for (const branch of branches.slice(0, 2)) {
      for (const sku of skus) {
        rows.push([sku, branch, 0, ""]);
      }
    }

    saveFile("allocation-template.csv", toCsv(rows));
    toast.message(
      "Set the quantities and add your own rows. One row is one SKU going to one branch."
    );
  }

  function downloadSkipped(problems: Problem[]) {
    saveFile(
      "allocation-skipped.csv",
      toCsv([
        [...COLUMNS, "Why it was skipped"],
        ...problems.map((p) => [p.sku, p.branchName, "", "", p.reason]),
      ])
    );
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        toast.error("That file has no rows under its header.");
        return;
      }

      const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
      const skuAt = header.findIndex((h) => h === "sku");
      const branchAt = header.findIndex((h) => h === "branch");
      const qtyAt = header.findIndex((h) => h === "quantity" || h === "qty");
      const notesAt = header.findIndex((h) => h === "notes");

      const missing = [
        skuAt === -1 ? "SKU" : null,
        branchAt === -1 ? "Branch" : null,
        qtyAt === -1 ? "Quantity" : null,
      ].filter((c): c is string => c !== null);
      if (missing.length > 0) {
        toast.error(
          `Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Download the template and edit that copy.`
        );
        return;
      }

      const rows = lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        return {
          sku: cells[skuAt] ?? "",
          branchName: cells[branchAt] ?? "",
          quantity: parseQuantity(cells[qtyAt] ?? ""),
          ...(notesAt !== -1 && cells[notesAt] ? { notes: cells[notesAt] } : {}),
        };
      });

      const outcome = (await upload({ fileName: file.name, rows })) as Result;
      setResult(outcome);

      if (outcome.created.length === 0) {
        toast.error("No request could be created from that file.");
      } else {
        toast.success(
          `${outcome.created.length} request${outcome.created.length === 1 ? "" : "s"} awaiting approval · ` +
            `${outcome.totalUnits.toLocaleString("en-PH")} units` +
            (outcome.problems.length ? ` · ${outcome.problems.length} row(s) skipped` : "")
        );
        onUploaded?.();
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 p-4">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold">Upload a pre-allocated push</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One row per SKU per branch. Rows are grouped into one request per
            branch and wait here for approval — nothing moves on upload.
            {template?.sourceName
              ? ` Allocated from ${template.sourceName}.`
              : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || template === undefined}
          onClick={downloadTemplate}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Template
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          Upload allocation
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {result && (
        <div className="space-y-3 border-t p-4">
          <div className="flex items-start gap-2">
            <p className="mr-auto text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{result.fileName}</span>{" "}
              · {result.rowsRead} row{result.rowsRead === 1 ? "" : "s"} read ·{" "}
              {result.created.length} request
              {result.created.length === 1 ? "" : "s"} created ·{" "}
              {result.totalUnits.toLocaleString("en-PH")} units from{" "}
              {result.sourceName}
            </p>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {result.created.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.created.map((c) => (
                <span
                  key={c.branchName}
                  className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs text-sky-800"
                >
                  {c.branchName} · {c.units.toLocaleString("en-PH")} units over{" "}
                  {c.lines} line{c.lines === 1 ? "" : "s"}
                </span>
              ))}
            </div>
          )}

          {result.problems.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60">
              <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2">
                <p className="mr-auto text-xs font-medium text-amber-900">
                  {result.problems.length} row
                  {result.problems.length === 1 ? "" : "s"} left out — the rest
                  went through
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 bg-background text-xs"
                  onClick={() => downloadSkipped(result.problems)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download these rows
                </Button>
              </div>
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {result.problems.map((p) => (
                      <tr
                        key={`${p.row}-${p.sku}`}
                        className="border-b border-amber-100 last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground tabular-nums">
                          line {p.row}
                        </td>
                        <td className="px-3 py-1.5 font-mono">{p.sku || "—"}</td>
                        <td className="px-3 py-1.5">{p.branchName || "—"}</td>
                        <td className="px-3 py-1.5 text-amber-900">{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
