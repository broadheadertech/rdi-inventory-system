"use client";

// Upload a stock movement report from the old system — one row per product per
// store for one month. Each STORE is mapped to a branch, the upload is previewed
// against what the branches hold now, and applying it sets each branch's stock
// to the row's EndingBalance. The movement columns are kept as the month's
// history (convex/inventory/legacyStock.ts).

import { useMemo, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, getErrorMessage } from "@/lib/utils";

// ─── The file ─────────────────────────────────────────────────────────────────

type NumKey =
  | "beginningInv"
  | "sale"
  | "container"
  | "returned"
  | "movementOut"
  | "movementIn"
  | "rpo"
  | "endingBalance";
type TextKey = "productCode" | "productDesc" | "store" | "brand";

const COLUMNS: { key: NumKey | TextKey; header: string; required?: boolean; aliases?: string[] }[] = [
  { key: "productCode", header: "ProductCode", required: true },
  { key: "productDesc", header: "ProductDesc" },
  { key: "beginningInv", header: "BeginningInv", aliases: ["beginninginventory"] },
  { key: "sale", header: "Sale", aliases: ["sales"] },
  { key: "container", header: "Container" },
  { key: "returned", header: "Return", aliases: ["returns"] },
  { key: "movementOut", header: "MovementOut" },
  { key: "movementIn", header: "MovementIn" },
  { key: "rpo", header: "RPO" },
  { key: "endingBalance", header: "EndingBalance", required: true, aliases: ["endingbal"] },
  { key: "store", header: "STORE", required: true },
  { key: "brand", header: "Brand" },
];
const NUM_KEYS: NumKey[] = [
  "beginningInv",
  "sale",
  "container",
  "returned",
  "movementOut",
  "movementIn",
  "rpo",
  "endingBalance",
];

type FileRow = { line: number } & Record<TextKey, string> & Record<NumKey, number>;
type Problem = { line: number | ""; store: string; productCode: string; problem: string };

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  return String(cell).trim();
}

function cellNumber(cell: unknown): number {
  if (cell === null || cell === undefined || cell === "") return 0;
  if (typeof cell === "number") return cell;
  const text = String(cell).replace(/,/g, "").trim();
  return text === "" ? 0 : Number(text);
}

/**
 * Reads the sheet into rows. Rows that can't be used — a missing code or store,
 * a number that isn't one, the same product twice for a store — are problems
 * and left out. Rows whose movements don't add up to EndingBalance are kept
 * but listed, since EndingBalance is what sets the stock.
 */
function readRows(table: unknown[][]): { rows: FileRow[]; problems: Problem[]; unbalanced: Problem[] } {
  const headerIndex = table
    .slice(0, 15)
    .findIndex((r) => {
      const cells = r.map((c) => normalize(cellText(c)));
      return cells.includes("productcode") && cells.includes("store") && cells.includes("endingbalance");
    });
  if (headerIndex === -1) {
    throw new Error(
      "Couldn't find the header row. The file needs at least ProductCode, STORE and EndingBalance columns."
    );
  }

  const header = table[headerIndex].map((c) => normalize(cellText(c)));
  const columnAt = new Map<string, number>();
  const missing: string[] = [];
  for (const col of COLUMNS) {
    const names = [normalize(col.header), ...(col.aliases ?? [])];
    const at = header.findIndex((h) => names.includes(h));
    if (at === -1) {
      if (col.required) missing.push(col.header);
    } else {
      columnAt.set(col.key, at);
    }
  }
  if (missing.length > 0) throw new Error(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);

  const rows: FileRow[] = [];
  const problems: Problem[] = [];
  const unbalanced: Problem[] = [];

  for (let i = headerIndex + 1; i < table.length; i++) {
    const raw = table[i];
    if (!raw || raw.every((c) => cellText(c) === "")) continue;
    const at = (key: string) => {
      const idx = columnAt.get(key);
      return idx === undefined ? null : raw[idx];
    };
    const line = i + 1;
    const row = {
      line,
      productCode: cellText(at("productCode")),
      productDesc: cellText(at("productDesc")),
      store: cellText(at("store")),
      brand: cellText(at("brand")),
    } as FileRow;
    const base = { line, store: row.store, productCode: row.productCode };

    if (!row.productCode) {
      problems.push({ ...base, problem: "No ProductCode." });
      continue;
    }
    if (!row.store) {
      problems.push({ ...base, problem: "No STORE." });
      continue;
    }
    const badNumber = NUM_KEYS.find((k) => {
      row[k] = cellNumber(at(k));
      return !Number.isFinite(row[k]);
    });
    if (badNumber) {
      const col = COLUMNS.find((c) => c.key === badNumber)!;
      problems.push({ ...base, problem: `${col.header} isn't a number.` });
      continue;
    }
    if (!Number.isInteger(row.endingBalance) || row.endingBalance < 0) {
      problems.push({ ...base, problem: "EndingBalance must be a whole number, 0 or more." });
      continue;
    }

    const expected =
      row.beginningInv + row.container + row.returned + row.movementIn - row.sale - row.movementOut - row.rpo;
    if (Math.abs(expected - row.endingBalance) > 0.0001) {
      unbalanced.push({
        ...base,
        problem: `Movements add up to ${expected}, EndingBalance is ${row.endingBalance}.`,
      });
    }
    rows.push(row);
  }

  // The same product twice for one store: which count is right is unknowable.
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = `${normalize(r.store)}|${r.productCode}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const kept: FileRow[] = [];
  for (const r of rows) {
    if ((seen.get(`${normalize(r.store)}|${r.productCode}`) ?? 0) > 1) {
      problems.push({
        line: r.line,
        store: r.store,
        productCode: r.productCode,
        problem: "This product appears more than once for this store.",
      });
    } else {
      kept.push(r);
    }
  }

  return { rows: kept, problems, unbalanced };
}

async function readFile(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return (await readSheet(file)) as unknown[][];
  if (name.endsWith(".csv")) {
    return await new Promise((resolve, reject) =>
      Papa.parse<unknown[]>(file, {
        skipEmptyLines: true,
        complete: (r) => resolve(r.data),
        error: (e) => reject(e),
      })
    );
  }
  if (name.endsWith(".xls")) {
    throw new Error("Old .xls files can't be read. In Excel, Save As → Excel Workbook (.xlsx) and upload that.");
  }
  throw new Error("Upload an .xlsx or .csv file.");
}

function downloadCsv(fileName: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([Papa.unparse(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function previousMonth(): string {
  const pht = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(pht.getUTCFullYear(), pht.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const STORE_MAP_KEY = "rdi.legacyUpload.storeMap";

function rememberedStoreMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORE_MAP_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Preview = {
  row: FileRow;
  branchId: Id<"branches">;
  found: boolean;
  sku?: string;
  name?: string;
  onHand: number;
  held: number;
};

type Result = {
  applied: number;
  unchanged: number;
  skipped: Problem[];
};

const SKIP = "__skip__";

export default function LegacyStockUploadPage() {
  const convex = useConvex();
  const branches = useQuery(api.dashboards.birReports.listActiveBranches);
  const uploads = useQuery(api.inventory.legacyStock.listLegacyUploads);
  const startUpload = useMutation(api.inventory.legacyStock.startLegacyUpload);
  const applyRows = useMutation(api.inventory.legacyStock.applyLegacyRows);
  const finishUpload = useMutation(api.inventory.legacyStock.finishLegacyUpload);

  const [period, setPeriod] = useState(previousMonth);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<FileRow[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [unbalanced, setUnbalanced] = useState<Problem[]>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);

  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [salesSince, setSalesSince] = useState<Record<string, number>>({});
  const [previewing, setPreviewing] = useState(false);

  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);

  const stores = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.store, (counts.get(r.store) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const branchName = (id: string) => branches?.find((b) => b.id === id)?.name ?? "—";

  function reset() {
    setRows([]);
    setProblems([]);
    setUnbalanced([]);
    setPreview(null);
    setResult(null);
    setFileName("");
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    reset();
    setReading(true);
    try {
      const table = await readFile(file);
      const parsed = readRows(table);
      if (parsed.rows.length === 0 && parsed.problems.length === 0) {
        throw new Error("The file has a header row but no data rows.");
      }
      setFileName(file.name);
      setRows(parsed.rows);
      setProblems(parsed.problems);
      setUnbalanced(parsed.unbalanced);

      // Match each STORE to a branch by name, or as it was matched last time.
      const remembered = rememberedStoreMap();
      const map: Record<string, string> = {};
      for (const r of parsed.rows) {
        if (map[r.store] !== undefined) continue;
        const byName = branches?.find((b) => normalize(b.name) === normalize(r.store));
        const previous = remembered[r.store];
        map[r.store] =
          byName?.id ??
          (previous && (previous === SKIP || branches?.some((b) => b.id === previous)) ? previous : "");
      }
      setStoreMap(map);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setReading(false);
    }
  }

  function setStoreBranch(store: string, branchId: string) {
    setStoreMap((m) => {
      const next = { ...m, [store]: branchId };
      try {
        localStorage.setItem(STORE_MAP_KEY, JSON.stringify({ ...rememberedStoreMap(), [store]: branchId }));
      } catch {
        // Remembering the match is a convenience only.
      }
      return next;
    });
    setPreview(null);
  }

  const unmappedStores = stores.filter(([store]) => !storeMap[store]).map(([store]) => store);
  const mappedRows = rows.filter((r) => storeMap[r.store] && storeMap[r.store] !== SKIP);

  async function handlePreview() {
    setPreviewing(true);
    setResult(null);
    try {
      const out: Preview[] = [];
      for (const part of chunk(mappedRows, 200)) {
        const found = await convex.query(api.inventory.legacyStock.previewLegacyRows, {
          rows: part.map((r) => ({
            branchId: storeMap[r.store] as Id<"branches">,
            productCode: r.productCode,
          })),
        });
        part.forEach((row, i) => {
          const f = found[i];
          out.push({
            row,
            branchId: storeMap[row.store] as Id<"branches">,
            found: f.found,
            sku: f.found ? f.sku : undefined,
            name: f.found ? f.name : undefined,
            onHand: f.found ? f.onHand : 0,
            held: f.found ? f.held : 0,
          });
        });
      }
      const branchIds = [...new Set(out.map((p) => p.branchId))];
      const sales = await convex.query(api.inventory.legacyStock.branchSalesSince, { branchIds, period });
      setSalesSince(Object.fromEntries(sales.map((s) => [s.branchId, s.transactions])));
      setPreview(out);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPreviewing(false);
    }
  }

  const summary = useMemo(() => {
    if (!preview) return null;
    const byBranch = new Map<
      string,
      { rows: number; notFound: number; held: number; before: number; after: number }
    >();
    let notFound = 0;
    let heldConflicts = 0;
    for (const p of preview) {
      const b = byBranch.get(p.branchId) ?? { rows: 0, notFound: 0, held: 0, before: 0, after: 0 };
      b.rows++;
      if (!p.found) {
        b.notFound++;
        notFound++;
      } else if (p.row.endingBalance < p.held) {
        b.held++;
        heldConflicts++;
      } else {
        b.before += p.onHand;
        b.after += p.row.endingBalance;
      }
      byBranch.set(p.branchId, b);
    }
    const changed = preview.filter(
      (p) => p.found && p.row.endingBalance >= p.held && p.row.endingBalance !== p.onHand
    );
    return { byBranch: [...byBranch.entries()], notFound, heldConflicts, changed };
  }, [preview]);

  const branchesWithSales = summary
    ? summary.byBranch.filter(([id]) => (salesSince[id] ?? 0) > 0)
    : [];

  function previewProblems(): Problem[] {
    const out: Problem[] = [...problems];
    for (const p of preview ?? []) {
      const base = { line: p.row.line, store: p.row.store, productCode: p.row.productCode };
      if (!p.found) out.push({ ...base, problem: "Product code not found as a barcode or SKU." });
      else if (p.row.endingBalance < p.held) {
        out.push({ ...base, problem: `${p.held} units held for a transfer or quarantined — more than the EndingBalance.` });
      }
    }
    for (const store of stores.filter(([s]) => storeMap[s] === SKIP).map(([s]) => s)) {
      out.push({ line: "", store, productCode: "", problem: "Store skipped — not mapped to a branch." });
    }
    return out;
  }

  async function handleApply() {
    if (!preview || !summary) return;
    const toApply = preview.filter((p) => p.found && p.row.endingBalance >= p.held);
    if (toApply.length === 0) {
      toast.error("Nothing to apply.");
      return;
    }
    const salesWarning =
      branchesWithSales.length > 0
        ? `\n\nWARNING: ${branchesWithSales.map(([id]) => branchName(id)).join(", ")} already rang sales in RDI after ${period}. Their stock will be overwritten with the file's counts.`
        : "";
    const ok = window.confirm(
      `Set stock for ${toApply.length} product${toApply.length === 1 ? "" : "s"} across ${summary.byBranch.length} branch${summary.byBranch.length === 1 ? "" : "es"} to the EndingBalance in ${fileName}?\n\n` +
        `${summary.changed.length} will change. This can't be undone from here; every change is recorded in the audit log.` +
        salesWarning
    );
    if (!ok) return;

    setApplying(true);
    setProgress({ done: 0, total: toApply.length });
    const outcome: Result = { applied: 0, unchanged: 0, skipped: [] };
    try {
      const uploadId = await startUpload({ fileName, period });
      for (const part of chunk(toApply, 100)) {
        const r = await applyRows({
          uploadId,
          rows: part.map(({ row, branchId }) => ({
            branchId,
            productCode: row.productCode,
            productDesc: row.productDesc || undefined,
            brand: row.brand || undefined,
            store: row.store,
            beginningInv: row.beginningInv,
            sale: row.sale,
            container: row.container,
            returned: row.returned,
            movementOut: row.movementOut,
            movementIn: row.movementIn,
            rpo: row.rpo,
            endingBalance: row.endingBalance,
          })),
        });
        outcome.applied += r.applied;
        outcome.unchanged += r.unchanged;
        outcome.skipped.push(...r.skipped.map((s) => ({ line: "" as const, ...s, problem: s.reason })));
        setProgress((p) => ({ ...p, done: p.done + part.length }));
      }
      await finishUpload({ uploadId });
      setResult(outcome);
      toast.success(`Stock set for ${outcome.applied + outcome.unchanged} products.`);
    } catch (err) {
      setResult(outcome);
      toast.error(`Upload stopped: ${getErrorMessage(err)}`);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/inventory"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Inventory
        </Link>
        <h1 className="text-2xl font-bold">Upload Legacy Stock</h1>
        <p className="text-sm text-muted-foreground">
          Upload a stock movement report from the old system. Each branch&apos;s stock is set to the
          file&apos;s EndingBalance, and the movement columns are kept as that month&apos;s history.
        </p>
      </div>

      {/* 1 — File */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">1. Choose the month and file</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="period">Month the report covers</Label>
            <Input
              id="period"
              type="month"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPreview(null);
              }}
              disabled={applying}
              className="w-44"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="file">File (.xlsx or .csv)</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.csv"
              disabled={applying || reading || branches === undefined}
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="w-80"
            />
          </div>
          {reading && <Loader2 className="mb-2 h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground">
          Columns: ProductCode, ProductDesc, BeginningInv, Sale, Container, Return, MovementOut,
          MovementIn, RPO, EndingBalance, STORE, Brand. ProductCode is matched to a product&apos;s
          barcode, then its SKU — format that column as Text in Excel if codes start with 0.
        </p>
        {fileName && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <FileSpreadsheet className="h-4 w-4" /> {fileName}
            </span>
            <span>{rows.length} rows ready</span>
            {problems.length > 0 && (
              <span className="text-red-600">{problems.length} rows with problems (left out)</span>
            )}
            {unbalanced.length > 0 && (
              <span className="text-amber-600">
                {unbalanced.length} rows don&apos;t add up (EndingBalance is still used)
              </span>
            )}
            {(problems.length > 0 || unbalanced.length > 0) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(`issues-${fileName}.csv`, [
                    ...problems.map((p) => ({ ...p, type: "Left out" })),
                    ...unbalanced.map((p) => ({ ...p, type: "Doesn't add up" })),
                  ])
                }
              >
                <Download className="mr-1 h-4 w-4" /> Download issues
              </Button>
            )}
          </div>
        )}
      </section>

      {/* 2 — Stores */}
      {stores.length > 0 && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">2. Match each STORE to a branch</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>STORE in the file</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>RDI branch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map(([store, count]) => (
                  <TableRow key={store}>
                    <TableCell className="font-medium">{store}</TableCell>
                    <TableCell className="text-right">{count}</TableCell>
                    <TableCell>
                      <Select
                        value={storeMap[store] || undefined}
                        onValueChange={(value) => setStoreBranch(store, value)}
                        disabled={applying}
                      >
                        <SelectTrigger className={cn("w-64", !storeMap[store] && "border-red-400")}>
                          <SelectValue placeholder="Choose a branch…" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches?.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                          <SelectItem value={SKIP}>Skip this store</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button
            onClick={handlePreview}
            disabled={previewing || applying || unmappedStores.length > 0 || mappedRows.length === 0}
          >
            {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {unmappedStores.length > 0
              ? `Match ${unmappedStores.length} more store${unmappedStores.length === 1 ? "" : "s"}`
              : "Preview changes"}
          </Button>
        </section>
      )}

      {/* 3 — Preview */}
      {preview && summary && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">3. Review and apply</h2>

          {branchesWithSales.length > 0 && (
            <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {branchesWithSales
                  .map(([id]) => `${branchName(id)} (${salesSince[id] > 100 ? "100+" : salesSince[id]} sales)`)
                  .join(", ")}{" "}
                already rang sales in RDI after {period}. Applying sets their stock to the file&apos;s
                counts, which don&apos;t include those sales.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>{summary.changed.length} products change</span>
            {summary.notFound > 0 && (
              <span className="text-red-600">{summary.notFound} product codes not found</span>
            )}
            {summary.heldConflicts > 0 && (
              <span className="text-red-600">
                {summary.heldConflicts} with more units held than the EndingBalance
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(`preview-issues-${fileName}.csv`, previewProblems())}
            >
              <Download className="mr-1 h-4 w-4" /> Download rows that won&apos;t apply
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Not found</TableHead>
                  <TableHead className="text-right">On hand now</TableHead>
                  <TableHead className="text-right">After upload</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byBranch.map(([id, b]) => (
                  <TableRow key={id}>
                    <TableCell className="font-medium">{branchName(id)}</TableCell>
                    <TableCell className="text-right">{b.rows}</TableCell>
                    <TableCell className={cn("text-right", b.notFound > 0 && "text-red-600")}>
                      {b.notFound}
                    </TableCell>
                    <TableCell className="text-right">{b.before.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{b.after.toLocaleString()}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        b.after > b.before && "text-green-700",
                        b.after < b.before && "text-red-600"
                      )}
                    >
                      {b.after - b.before > 0 ? "+" : ""}
                      {(b.after - b.before).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {summary.changed.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Products that change{summary.changed.length > 200 ? " (first 200)" : ""}
              </summary>
              <div className="mt-2 max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead>ProductCode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Now</TableHead>
                      <TableHead className="text-right">After</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.changed.slice(0, 200).map((p) => (
                      <TableRow key={`${p.branchId}-${p.row.line}`}>
                        <TableCell>{branchName(p.branchId)}</TableCell>
                        <TableCell className="font-mono text-xs">{p.row.productCode}</TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="text-right">{p.onHand}</TableCell>
                        <TableCell className="text-right font-medium">{p.row.endingBalance}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleApply} disabled={applying || !!result}>
              {applying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {applying ? `Applying ${progress.done} / ${progress.total}…` : "Apply to branch stock"}
            </Button>
          </div>

          {result && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {result.applied} changed · {result.unchanged} already matched · {result.skipped.length} skipped
              </p>
              {result.skipped.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv(`skipped-${fileName}.csv`, result.skipped)}
                >
                  <Download className="mr-1 h-4 w-4" /> Download skipped rows
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>
                Upload another file
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Past uploads */}
      <section className="space-y-3">
        <h2 className="font-semibold">Past uploads</h2>
        {uploads === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No uploads yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Changed</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Units before → after</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((u) => (
                  <TableRow key={u._id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                    </TableCell>
                    <TableCell>{u.period}</TableCell>
                    <TableCell className="max-w-48 truncate">{u.fileName}</TableCell>
                    <TableCell className="text-right">{u.rowCount}</TableCell>
                    <TableCell className="text-right">{u.appliedCount}</TableCell>
                    <TableCell className={cn("text-right", u.skippedCount > 0 && "text-red-600")}>
                      {u.skippedCount}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {u.unitsBefore.toLocaleString()} → {u.unitsAfter.toLocaleString()}
                    </TableCell>
                    <TableCell>{u.uploadedByName}</TableCell>
                    <TableCell>
                      {u.status === "completed" ? (
                        "Completed"
                      ) : (
                        <span className="text-amber-600">Stopped part-way</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
