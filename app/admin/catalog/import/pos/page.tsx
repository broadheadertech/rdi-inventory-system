"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import Papa from "papaparse";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  X,
  Loader2,
} from "lucide-react";

const BATCH_SIZE = 200;
const MAX_TOTAL_ROWS = 5000;

// Canonical column header names (matches the POS export). Matching is
// case-insensitive and normalises whitespace + punctuation.
const POS_COLUMNS = [
  "Barcode / Product Code",
  "Product ID",
  "Product No",
  "Short PCH Description PCH (25 PCH Chars)",
  "Long Description",
  "UOM",
  "SRP",
  "Price Mode",
  "Senior Item?",
  "SCD Value",
  "Is VAT?",
  "Markup %",
  "Min. Level",
  "STYLE CODE",
  "CALENDAR CODE",
  "PRICING",
  "Category 4",
  "With Exp. Date?",
  "BRAND",
  "DEPARTMENT",
  "DIVISION",
  "CATEGORY",
  "SUBCATEGORY",
  "ACTUAL COUNT",
  "ACTIVE",
];

const REQUIRED = ["BRAND", "CATEGORY"];

const SAMPLE_CSV = `Barcode / Product Code,Product ID,Product No,Short PCH Description PCH (25 PCH Chars),Long Description,UOM,SRP,Price Mode,Senior Item?,SCD Value,Is VAT?,Markup %,Min. Level,STYLE CODE,CALENDAR CODE,PRICING,Category 4,With Exp. Date?,BRAND,DEPARTMENT,DIVISION,CATEGORY,SUBCATEGORY,ACTUAL COUNT,ACTIVE
8901234500001,AERO-MTBT-S-RED,PRD-0001,Metro Basic Tee,Essential cotton crew neck tee,PC,499,Regular,N,0,Y,100,5,STY-MBT-001,May Collection,Standard,,N,Aeropostale,MENS,APPAREL,TOPS,,25,Y
8901234500002,AERO-MTBT-M-RED,PRD-0002,Metro Basic Tee,Essential cotton crew neck tee,PC,499,Regular,N,0,Y,100,5,STY-MBT-001,May Collection,Standard,,N,Aeropostale,MENS,APPAREL,TOPS,,30,Y
8901234500003,HUR-PHT18-30-BLK,PRD-0003,Phantom 18 Boardshort,Quick-dry 18-inch boardshorts,PC,1699,Regular,N,0,Y,100,5,STY-PHT18-001,April Collection,Standard,,N,Hurley,MENS,APPAREL,SWIMWEAR,,15,Y
`;

function normHeader(h: string): string {
  return h.trim().toUpperCase().replace(/\s+/g, " ");
}

function pickField(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const target = normHeader(name);
    for (const key of Object.keys(row)) {
      if (normHeader(key) === target) return (row[key] ?? "").trim();
    }
  }
  return "";
}

function parseBoolean(v: string): boolean | undefined {
  if (!v) return undefined;
  const t = v.trim().toUpperCase();
  if (["Y", "YES", "TRUE", "1", "ACTIVE"].includes(t)) return true;
  if (["N", "NO", "FALSE", "0", "INACTIVE"].includes(t)) return false;
  return undefined;
}

function parseNumber(v: string): number | undefined {
  if (!v) return undefined;
  const cleaned = v.replace(/,/g, "").trim();
  if (cleaned === "") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

interface PosRow {
  raw: Record<string, string>;
  barcode: string;
  productId: string;
  productNo: string;
  shortDescription: string;
  longDescription: string;
  uom: string;
  srpPesos?: number;
  priceMode: string;
  seniorItem?: boolean;
  scdValue?: number;
  isVat?: boolean;
  markupPercent?: number;
  minLevel?: number;
  styleCode: string;
  calendarCode: string;
  pricing: string;
  category4: string;
  withExpDate?: boolean;
  brand: string;
  department: string;
  division: string;
  category: string;
  subCategory: string;
  actualCount?: number;
  active?: boolean;
}

function rowFromRaw(raw: Record<string, string>): PosRow {
  return {
    raw,
    barcode: pickField(raw, "Barcode / Product Code", "Barcode", "Product Code"),
    productId: pickField(raw, "Product ID"),
    productNo: pickField(raw, "Product No"),
    shortDescription: pickField(raw, "Short PCH Description PCH (25 PCH Chars)", "Short Description"),
    longDescription: pickField(raw, "Long Description"),
    uom: pickField(raw, "UOM"),
    srpPesos: parseNumber(pickField(raw, "SRP")),
    priceMode: pickField(raw, "Price Mode"),
    seniorItem: parseBoolean(pickField(raw, "Senior Item?")),
    scdValue: parseNumber(pickField(raw, "SCD Value")),
    isVat: parseBoolean(pickField(raw, "Is VAT?")),
    markupPercent: parseNumber(pickField(raw, "Markup %")),
    minLevel: parseNumber(pickField(raw, "Min. Level")),
    styleCode: pickField(raw, "STYLE CODE"),
    calendarCode: pickField(raw, "CALENDAR CODE"),
    pricing: pickField(raw, "PRICING"),
    category4: pickField(raw, "Category 4"),
    withExpDate: parseBoolean(pickField(raw, "With Exp. Date?")),
    brand: pickField(raw, "BRAND"),
    department: pickField(raw, "DEPARTMENT"),
    division: pickField(raw, "DIVISION"),
    category: pickField(raw, "CATEGORY"),
    subCategory: pickField(raw, "SUBCATEGORY"),
    actualCount: parseNumber(pickField(raw, "ACTUAL COUNT")),
    active: parseBoolean(pickField(raw, "ACTIVE")),
  };
}

interface ImportError {
  rowIndex: number;
  barcode: string;
  error: string;
}
interface ImportSkipped {
  rowIndex: number;
  barcode: string;
  reason: string;
}
interface PriceUpdate {
  rowIndex: number;
  sku: string;
  barcode: string;
  oldPriceCentavos: number;
  newPriceCentavos: number;
}
interface BatchResult {
  successCount: number;
  skippedCount: number;
  priceUpdatedCount: number;
  failureCount: number;
  stockSeededCount: number;
  errors: ImportError[];
  skipped: ImportSkipped[];
  priceUpdates: PriceUpdate[];
}

export default function PosBulkImportPage() {
  const importPos = useAction(api.catalog.bulkImport.bulkImportProductsPos);
  const branches = useQuery(api.auth.branches.listBranches) as
    | { _id: Id<"branches">; name: string; isActive: boolean }[]
    | undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<PosRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [stockBranchId, setStockBranchId] = useState<string>("");
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [results, setResults] = useState<{
    successCount: number;
    skippedCount: number;
    priceUpdatedCount: number;
    failureCount: number;
    stockSeededCount: number;
    errors: ImportError[];
    skipped: ImportSkipped[];
    priceUpdates: PriceUpdate[];
  } | null>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      error: (err) => toast.error(`Failed to read file: ${err.message}`),
      complete: (parseResult) => {
        const fields = parseResult.meta.fields ?? [];
        const fieldsNorm = new Set(fields.map(normHeader));
        const missing = REQUIRED.filter((c) => !fieldsNorm.has(normHeader(c)));
        if (missing.length > 0) {
          toast.error(`Missing required columns: ${missing.join(", ")}`);
          return;
        }
        if (parseResult.data.length === 0) {
          toast.error("CSV file is empty");
          return;
        }
        if (parseResult.data.length > MAX_TOTAL_ROWS) {
          toast.error(
            `CSV has ${parseResult.data.length} rows. Maximum allowed is ${MAX_TOTAL_ROWS}.`,
          );
          return;
        }
        const rows = parseResult.data.map(rowFromRaw).filter((r) => r.brand && r.category);
        setParsedRows(rows);
        setFileName(file.name);
        setResults(null);
        toast.success(`Parsed ${rows.length} rows from ${file.name}`);
      },
    });
  }, []);

  // Pick up handoff from the sibling /admin/catalog/import page when the user
  // dropped a POS-format CSV there and got auto-redirected here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("pos-import-handoff");
    if (!raw) return;
    sessionStorage.removeItem("pos-import-handoff");
    try {
      const parsed = JSON.parse(raw) as {
        fileName: string;
        rows: Record<string, string>[];
      };
      const rows = parsed.rows.map(rowFromRaw).filter((r) => r.brand && r.category);
      if (rows.length === 0) {
        toast.error("No valid rows found in handoff (BRAND and CATEGORY are required).");
        return;
      }
      setParsedRows(rows);
      setFileName(parsed.fileName);
      toast.success(`Loaded ${rows.length} rows from ${parsed.fileName}`);
    } catch {
      // ignore — user can re-drop the file manually
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pos-bulk-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setParsedRows([]);
    setFileName("");
    setResults(null);
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;
    setIsImporting(true);
    setResults(null);

    const items = parsedRows.map((r) => ({
      barcode: r.barcode || undefined,
      productId: r.productId || undefined,
      productNo: r.productNo || undefined,
      shortDescription: r.shortDescription || undefined,
      longDescription: r.longDescription || undefined,
      uom: r.uom || undefined,
      srpPesos: r.srpPesos,
      priceMode: r.priceMode || undefined,
      seniorItem: r.seniorItem,
      scdValue: r.scdValue,
      isVat: r.isVat,
      markupPercent: r.markupPercent,
      minLevel: r.minLevel,
      styleCode: r.styleCode || undefined,
      calendarCode: r.calendarCode || undefined,
      pricing: r.pricing || undefined,
      category4: r.category4 || undefined,
      withExpDate: r.withExpDate,
      brand: r.brand,
      department: r.department || undefined,
      division: r.division || undefined,
      category: r.category,
      subCategory: r.subCategory || undefined,
      actualCount: r.actualCount,
      active: r.active,
    }));

    const batches: typeof items[] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }
    setTotalBatches(batches.length);

    const aggregated = {
      successCount: 0,
      skippedCount: 0,
      priceUpdatedCount: 0,
      failureCount: 0,
      stockSeededCount: 0,
      errors: [] as ImportError[],
      skipped: [] as ImportSkipped[],
      priceUpdates: [] as PriceUpdate[],
    };

    try {
      for (let b = 0; b < batches.length; b++) {
        setCurrentBatch(b + 1);
        const result: BatchResult = await importPos({
          items: batches[b],
          ...(stockBranchId
            ? { initialStockBranchId: stockBranchId as Id<"branches"> }
            : {}),
        });
        aggregated.successCount += result.successCount;
        aggregated.skippedCount += result.skippedCount;
        aggregated.priceUpdatedCount += result.priceUpdatedCount;
        aggregated.failureCount += result.failureCount;
        aggregated.stockSeededCount += result.stockSeededCount;
        const offset = b * BATCH_SIZE;
        result.errors.forEach((e) =>
          aggregated.errors.push({ ...e, rowIndex: e.rowIndex + offset }),
        );
        result.skipped.forEach((s) =>
          aggregated.skipped.push({ ...s, rowIndex: s.rowIndex + offset }),
        );
        result.priceUpdates.forEach((p) =>
          aggregated.priceUpdates.push({ ...p, rowIndex: p.rowIndex + offset }),
        );
      }
      if (
        aggregated.failureCount === 0 &&
        aggregated.skippedCount === 0 &&
        aggregated.priceUpdatedCount === 0
      ) {
        toast.success(`Import complete! ${aggregated.successCount} products imported.`);
      } else {
        toast.warning(
          `Imported ${aggregated.successCount}, price-updated ${aggregated.priceUpdatedCount}, skipped ${aggregated.skippedCount}, failed ${aggregated.failureCount}.`,
        );
      }
    } catch (error) {
      toast.error(`Batch ${currentBatch} failed: ${getErrorMessage(error)}`);
    } finally {
      setResults(aggregated);
      setIsImporting(false);
      setCurrentBatch(0);
      setTotalBatches(0);
    }
  };

  const previewRows = parsedRows.slice(0, 5);
  const uniqueBrands = new Set(parsedRows.map((r) => r.brand.toLowerCase())).size;
  const uniqueCategories = new Set(
    parsedRows.map((r) => `${r.brand.toLowerCase()}::${r.category.toLowerCase()}`),
  ).size;
  const totalCount = parsedRows.reduce((s, r) => s + (r.actualCount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/catalog/import">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to Import
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">POS-Format Bulk Import</h1>
          <p className="text-sm text-muted-foreground">
            Upload the wide-column POS export (Barcode, SRP, Department, Division,
            Category, Subcategory, Actual Count, etc.). Departments / Divisions /
            Categories / Subcategories are matched against your Settings → Product
            Codes by description.
          </p>
        </div>
        <Button variant="outline" onClick={handleDownloadSample}>
          <Download className="mr-2 h-4 w-4" />
          Download Sample CSV
        </Button>
      </div>

      {/* Column reference */}
      <div className="rounded-md border bg-muted/30 p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Expected columns (case-insensitive, header order doesn&apos;t matter)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {POS_COLUMNS.map((c) => (
            <Badge
              key={c}
              variant={REQUIRED.includes(c) ? "default" : "secondary"}
              className="font-mono text-[10px]"
            >
              {c}
              {REQUIRED.includes(c) ? " *" : ""}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          * = required. Other columns are stored or ignored gracefully when missing.
        </p>
      </div>

      {parsedRows.length === 0 && !results && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
        >
          <Upload className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">
            {isDragging ? "Drop CSV file here" : "Click or drag CSV file to upload"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Up to {MAX_TOTAL_ROWS.toLocaleString()} rows
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {parsedRows.length > 0 && !results && (
        <>
          <div className="flex items-center justify-between rounded-md border p-4 flex-wrap gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">{fileName}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{parsedRows.length} rows</span>
                <span>
                  {uniqueBrands} brand{uniqueBrands !== 1 ? "s" : ""}
                </span>
                <span>
                  {uniqueCategories} categor{uniqueCategories !== 1 ? "ies" : "y"}
                </span>
                <span>
                  Σ Actual Count: {totalCount.toLocaleString("en-PH")} pcs
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={stockBranchId}
                onChange={(e) => setStockBranchId(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-sm"
                disabled={isImporting}
              >
                <option value="">No initial stock</option>
                {(branches ?? [])
                  .filter((b) => b.isActive)
                  .map((b) => (
                    <option key={b._id as string} value={b._id as string}>
                      Stock to: {b.name}
                    </option>
                  ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={isImporting}
              >
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing batch {currentBatch} of {totalBatches}...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import {parsedRows.length} Products
                  </>
                )}
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Preview (first {previewRows.length} of {parsedRows.length} rows)
            </p>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Product ID</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Subcat</TableHead>
                    <TableHead className="text-right">SRP</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.barcode || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.productId || "—"}</TableCell>
                      <TableCell>{r.shortDescription || r.longDescription || "—"}</TableCell>
                      <TableCell>{r.brand}</TableCell>
                      <TableCell>{r.department || "—"}</TableCell>
                      <TableCell>{r.division || "—"}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>{r.subCategory || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.srpPesos !== undefined ? r.srpPesos.toLocaleString("en-PH") : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.actualCount ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {results && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">Imported</p>
              <p className="text-2xl font-bold text-green-600">
                {results.successCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">Price Updated</p>
              <p className="text-2xl font-bold text-blue-600">
                {results.priceUpdatedCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">Skipped</p>
              <p className="text-2xl font-bold text-amber-600">
                {results.skippedCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold text-red-600">
                {results.failureCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">Stock Seeded</p>
              <p className="text-2xl font-bold">
                {results.stockSeededCount.toLocaleString()} pcs
              </p>
            </div>
          </div>

          {results.priceUpdates.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <p className="font-semibold text-blue-800 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Price Updates
              </p>
              <ul className="mt-2 text-sm text-blue-700 space-y-1 font-mono">
                {results.priceUpdates.slice(0, 25).map((p, i) => (
                  <li key={i}>
                    Row {p.rowIndex + 1} SKU &quot;{p.sku}&quot; price update: ₱
                    {(p.oldPriceCentavos / 100).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    → ₱
                    {(p.newPriceCentavos / 100).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </li>
                ))}
                {results.priceUpdates.length > 25 && (
                  <li className="text-blue-500 italic">
                    …and {results.priceUpdates.length - 25} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {results.errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="font-semibold text-red-800 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> Errors
              </p>
              <ul className="mt-2 text-sm text-red-700 space-y-1">
                {results.errors.slice(0, 25).map((e, i) => (
                  <li key={i}>
                    Row {e.rowIndex + 1} ({e.barcode}): {e.error}
                  </li>
                ))}
                {results.errors.length > 25 && (
                  <li className="text-red-500 italic">
                    …and {results.errors.length - 25} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {results.skipped.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-800 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Skipped (already exist)
              </p>
              <ul className="mt-2 text-sm text-amber-700 space-y-1">
                {results.skipped.slice(0, 15).map((s, i) => (
                  <li key={i}>
                    Row {s.rowIndex + 1} ({s.barcode}): {s.reason}
                  </li>
                ))}
                {results.skipped.length > 15 && (
                  <li className="text-amber-500 italic">
                    …and {results.skipped.length - 15} more
                  </li>
                )}
              </ul>
            </div>
          )}

          <div>
            <Button variant="outline" onClick={handleClear}>
              <X className="mr-1 h-4 w-4" />
              Import Another File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
