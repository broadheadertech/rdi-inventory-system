"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import Papa from "papaparse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  X,
  Loader2,
} from "lucide-react";
import {
  MASTERDATA_BATCH_SIZE,
  brandDisplayName,
  cleanLabel,
  isReservedRow,
  normalizeStyleCode,
  parseCalendarCode,
  productCodeDescription,
  type ProductCodeType,
} from "@/convex/_helpers/masterdata";

// The masterdata export's headers, as written (CLASSIFICATON included).
const MASTERDATA_COLUMNS = [
  "BRAND",
  "ITEM CODE",
  "CALENDAR CODE",
  "DEPARTMENT",
  "CLASS",
  "CATEGORY",
  "SUB CATEGORY",
  "STYLE CODE",
  "DESCRIPTION",
  "COLOR",
  "SIZE",
  "SRP1",
  "CURRENT PRICE",
  "LANDED COST",
  "CLASSIFICATON",
  "DESIGNS",
  "SPECS",
  "TRADING",
  "AGING",
];

const REQUIRED = ["BRAND", "ITEM CODE", "STYLE CODE", "CATEGORY", "CURRENT PRICE"];

function normHeader(h: string): string {
  return h.trim().toUpperCase().replace(/\s+/g, " ");
}

function pickField(row: Record<string, string>, name: string): string {
  const target = normHeader(name);
  for (const key of Object.keys(row)) {
    if (normHeader(key) === target) return (row[key] ?? "").trim();
  }
  return "";
}

function parseNumber(v: string): number | undefined {
  const cleaned = v.replace(/,/g, "").trim();
  if (cleaned === "") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

interface MasterdataRow {
  brand: string;
  itemCode: string;
  calendarCode: string;
  department: string;
  division: string;
  category: string;
  subCategory: string;
  styleCode: string;
  description: string;
  color: string;
  size: string;
  srpPesos?: number;
  currentPricePesos?: number;
  landedCostPesos?: number;
  classification: string;
  designs: string;
  specs: string;
  trading: string;
  aging: string;
}

function rowFromRaw(raw: Record<string, string>): MasterdataRow {
  return {
    brand: pickField(raw, "BRAND"),
    itemCode: pickField(raw, "ITEM CODE"),
    calendarCode: pickField(raw, "CALENDAR CODE"),
    department: pickField(raw, "DEPARTMENT"),
    division: pickField(raw, "CLASS"),
    category: pickField(raw, "CATEGORY"),
    subCategory: pickField(raw, "SUB CATEGORY"),
    styleCode: pickField(raw, "STYLE CODE"),
    description: pickField(raw, "DESCRIPTION"),
    color: pickField(raw, "COLOR"),
    size: pickField(raw, "SIZE"),
    srpPesos: parseNumber(pickField(raw, "SRP1")),
    currentPricePesos: parseNumber(pickField(raw, "CURRENT PRICE")),
    landedCostPesos: parseNumber(pickField(raw, "LANDED COST")),
    classification: pickField(raw, "CLASSIFICATON"),
    designs: pickField(raw, "DESIGNS"),
    specs: pickField(raw, "SPECS"),
    trading: pickField(raw, "TRADING"),
    aging: pickField(raw, "AGING"),
  };
}

/** Why a row will not become an SKU, before anything is sent. */
function rowProblem(r: MasterdataRow): string | undefined {
  if (isReservedRow(r)) return "Reserved placeholder row";
  if (!normalizeStyleCode(r.styleCode)) return "No style code";
  if (!r.itemCode) return "No item code";
  if (!r.color || !r.size) return "No color or size";
  if (!r.currentPricePesos || r.currentPricePesos <= 0) return "No current price";
  return undefined;
}

interface ImportResult {
  createdCount: number;
  priceUpdatedCount: number;
  skippedCount: number;
  failureCount: number;
  errors: { rowIndex: number; itemCode: string; error: string }[];
  skipped: { rowIndex: number; itemCode: string; reason: string }[];
}

const CODE_COLUMNS: { type: ProductCodeType; label: string; field: keyof MasterdataRow }[] = [
  { type: "department", label: "Department", field: "department" },
  { type: "division", label: "Class", field: "division" },
  { type: "category", label: "Category", field: "category" },
  { type: "subCategory", label: "Sub category", field: "subCategory" },
];

export default function MasterdataImportPage() {
  const importBatch = useMutation(api.catalog.masterdataImport.importMasterdataBatch);
  const brands = useQuery(api.catalog.brands.listBrands);
  const productCodes = useQuery(api.catalog.productCodes.listAllActive);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [allRows, setAllRows] = useState<MasterdataRow[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportResult | null>(null);

  const processFiles = useCallback((files: File[]) => {
    const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (csvs.length === 0) {
      toast.error("Please upload the masterdata as CSV files");
      return;
    }
    // Batch files are named by row range, so name order is file order.
    csvs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    Promise.all(
      csvs.map(
        (file) =>
          new Promise<MasterdataRow[]>((resolve, reject) => {
            Papa.parse<Record<string, string>>(file, {
              header: true,
              skipEmptyLines: true,
              error: (err) => reject(new Error(`${file.name}: ${err.message}`)),
              complete: (parsed) => {
                const fields = new Set((parsed.meta.fields ?? []).map(normHeader));
                const missing = REQUIRED.filter((c) => !fields.has(c));
                if (missing.length > 0) {
                  reject(new Error(`${file.name} is missing columns: ${missing.join(", ")}`));
                  return;
                }
                resolve(parsed.data.map(rowFromRaw).filter((r) => r.brand));
              },
            });
          }),
      ),
    )
      .then((perFile) => {
        const rows = perFile.flat();
        setAllRows(rows);
        setFileNames(csvs.map((f) => f.name));
        setResults(null);
        toast.success(`Read ${rows.length.toLocaleString()} rows from ${csvs.length} file(s)`);
      })
      .catch((err: Error) => toast.error(err.message));
  }, []);

  // The check: what the import will do with this file, worked out before it runs.
  const check = useMemo(() => {
    if (allRows.length === 0) return null;

    const problems = new Map<string, number>();
    const valid: MasterdataRow[] = [];
    for (const r of allRows) {
      const problem = rowProblem(r);
      if (problem) problems.set(problem, (problems.get(problem) ?? 0) + 1);
      else valid.push(r);
    }

    // An item code listed twice: the later row wins.
    const byItemCode = new Map<string, MasterdataRow>();
    for (const r of valid) byItemCode.set(r.itemCode.toUpperCase(), r);
    const duplicateItemCodes = valid.length - byItemCode.size;
    const rows = [...byItemCode.values()];

    // One SKU per style, color and size: later item codes for the same
    // combination are repeat buys the import will skip.
    const combos = new Set<string>();
    let repeatBuys = 0;
    for (const r of rows) {
      const key = [cleanLabel(r.brand), normalizeStyleCode(r.styleCode), cleanLabel(r.color), cleanLabel(r.size)].join("|");
      if (combos.has(key)) repeatBuys++;
      else combos.add(key);
    }

    const brandNames = [...new Set(rows.map((r) => brandDisplayName(r.brand)))].sort();
    const knownBrands = new Set((brands ?? []).map((b) => b.name.toLowerCase()));
    const newBrands = brands ? brandNames.filter((b) => !knownBrands.has(b.toLowerCase())) : [];

    const styles = new Set(rows.map((r) => `${cleanLabel(r.brand)}|${normalizeStyleCode(r.styleCode)}`));

    const unmatched = CODE_COLUMNS.map(({ type, label, field }) => {
      const known = new Set(
        (productCodes ?? []).filter((pc) => pc.type === type).map((pc) => pc.description.toUpperCase()),
      );
      const counts = new Map<string, number>();
      for (const r of rows) {
        const desc = productCodeDescription(type, r[field] as string);
        if (desc && !known.has(desc)) counts.set(desc, (counts.get(desc) ?? 0) + 1);
      }
      return { label, values: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
    }).filter((u) => u.values.length > 0);

    const knownYears = new Set(
      (productCodes ?? []).filter((pc) => pc.type === "year").map((pc) => pc.code),
    );
    const newYears = [
      ...new Set(rows.map((r) => parseCalendarCode(r.calendarCode)?.year).filter((y): y is string => !!y)),
    ]
      .filter((y) => !knownYears.has(y))
      .sort()
      .map((y) => `20${y}`);

    return {
      rows,
      problems: [...problems.entries()],
      duplicateItemCodes,
      repeatBuys,
      brandNames,
      newBrands,
      styleCount: styles.size,
      unmatched,
      newYears,
    };
  }, [allRows, brands, productCodes]);

  const handleImport = async () => {
    if (!check) return;
    setIsImporting(true);
    setResults(null);

    const items = check.rows.map((r) => ({
      brand: r.brand,
      itemCode: r.itemCode,
      calendarCode: r.calendarCode || undefined,
      department: r.department || undefined,
      division: r.division || undefined,
      category: r.category,
      subCategory: r.subCategory || undefined,
      styleCode: r.styleCode,
      description: r.description,
      color: r.color,
      size: r.size,
      srpPesos: r.srpPesos,
      currentPricePesos: r.currentPricePesos!,
      landedCostPesos: r.landedCostPesos,
      classification: r.classification || undefined,
      designs: r.designs || undefined,
      specs: r.specs || undefined,
      trading: r.trading || undefined,
      aging: r.aging || undefined,
    }));
    const total = Math.ceil(items.length / MASTERDATA_BATCH_SIZE);
    setProgress({ done: 0, total });

    const aggregated: ImportResult = {
      createdCount: 0,
      priceUpdatedCount: 0,
      skippedCount: 0,
      failureCount: 0,
      errors: [],
      skipped: [],
    };

    try {
      for (let b = 0; b < total; b++) {
        const offset = b * MASTERDATA_BATCH_SIZE;
        const result = await importBatch({ rows: items.slice(offset, offset + MASTERDATA_BATCH_SIZE) });
        aggregated.createdCount += result.createdCount;
        aggregated.priceUpdatedCount += result.priceUpdatedCount;
        aggregated.skippedCount += result.skippedCount;
        aggregated.failureCount += result.failureCount;
        result.errors.forEach((e) => aggregated.errors.push({ ...e, rowIndex: e.rowIndex + offset }));
        result.skipped.forEach((s) => aggregated.skipped.push({ ...s, rowIndex: s.rowIndex + offset }));
        setProgress({ done: b + 1, total });
      }
      toast.success(
        `Imported ${aggregated.createdCount.toLocaleString()} SKUs, updated ${aggregated.priceUpdatedCount.toLocaleString()}.`,
      );
    } catch (error) {
      // Rows already sent are saved; running the file again picks up where it stopped.
      toast.error(`Import stopped: ${getErrorMessage(error)}. Run it again to continue.`);
    } finally {
      setResults(aggregated);
      setIsImporting(false);
    }
  };

  const handleClear = () => {
    setAllRows([]);
    setFileNames([]);
    setResults(null);
  };

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

      <div>
        <h1 className="text-2xl font-bold">Masterdata Import</h1>
        <p className="text-sm text-muted-foreground">
          Upload the merchandising masterdata — all batch files at once. Each style is its STYLE
          CODE within a brand, each SKU its ITEM CODE. SKUs sell at CURRENT PRICE, styles carry
          SRP1, and LANDED COST is the cost. Running a file again updates prices and fills in
          product codes added since.
        </p>
      </div>

      <div className="rounded-md border bg-muted/30 p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Columns read (case-insensitive, header order doesn&apos;t matter)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MASTERDATA_COLUMNS.map((c) => (
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
      </div>

      {allRows.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            processFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          }`}
        >
          <Upload className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">
            {isDragging ? "Drop the CSV files here" : "Click or drag the masterdata CSV files"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Select every batch file together</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            onChange={(e) => {
              processFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>
      )}

      {check && !results && (
        <>
          <div className="flex items-center justify-between rounded-md border p-4 flex-wrap gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">
                  {fileNames.length} file{fileNames.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span>{allRows.length.toLocaleString()} rows</span>
                <span>{check.rows.length.toLocaleString()} SKUs to import</span>
                <span>{check.styleCount.toLocaleString()} styles</span>
                <span>{check.brandNames.join(", ")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleClear} disabled={isImporting}>
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
              <Button onClick={handleImport} disabled={isImporting || !brands || !productCodes}>
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Batch {progress.done} of {progress.total}…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import {check.rows.length.toLocaleString()} SKUs
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border p-4 space-y-2 text-sm">
              <p className="font-semibold">What the import will do</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  {check.newBrands.length > 0
                    ? `Create brand${check.newBrands.length !== 1 ? "s" : ""}: ${check.newBrands.join(", ")}`
                    : "All brands already exist"}
                </li>
                {check.newYears.length > 0 && <li>Add year codes: {check.newYears.join(", ")}</li>}
                {check.duplicateItemCodes > 0 && (
                  <li>
                    {check.duplicateItemCodes} item code{check.duplicateItemCodes !== 1 ? "s" : ""} listed
                    twice — the later row is used
                  </li>
                )}
                {check.repeatBuys > 0 && (
                  <li>
                    {check.repeatBuys} repeat buy{check.repeatBuys !== 1 ? "s" : ""} (same style, color and
                    size under another item code) will be skipped — one SKU per combination
                  </li>
                )}
                {check.problems.map(([reason, count]) => (
                  <li key={reason}>
                    {count} row{count !== 1 ? "s" : ""} left out: {reason.toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border p-4 space-y-2 text-sm">
              <p className="font-semibold">Not in Settings → Product Codes</p>
              {check.unmatched.length === 0 ? (
                <p className="text-muted-foreground">Every value matches a product code.</p>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    These styles import without that link. Add the codes in Settings, then run the
                    file again to link them.
                  </p>
                  {check.unmatched.map((u) => (
                    <div key={u.label}>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">{u.label}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {u.values.map(([value, count]) => (
                          <Badge key={value} variant="outline" className="font-mono text-[10px]">
                            {value} · {count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {results && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">SKUs Created</p>
              <p className="text-2xl font-bold text-green-600">{results.createdCount.toLocaleString()}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">Price Updated</p>
              <p className="text-2xl font-bold text-blue-600">{results.priceUpdatedCount.toLocaleString()}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">Skipped</p>
              <p className="text-2xl font-bold text-amber-600">{results.skippedCount.toLocaleString()}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold text-red-600">{results.failureCount.toLocaleString()}</p>
            </div>
          </div>

          {results.errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="font-semibold text-red-800 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> Errors
              </p>
              <ul className="mt-2 text-sm text-red-700 space-y-1">
                {results.errors.slice(0, 25).map((e, i) => (
                  <li key={i}>
                    {e.itemCode}: {e.error}
                  </li>
                ))}
                {results.errors.length > 25 && (
                  <li className="italic">…and {results.errors.length - 25} more</li>
                )}
              </ul>
            </div>
          )}

          {results.skipped.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-800 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Skipped
              </p>
              <ul className="mt-2 text-sm text-amber-700 space-y-1">
                {results.skipped.slice(0, 25).map((s, i) => (
                  <li key={i}>
                    {s.itemCode}: {s.reason}
                  </li>
                ))}
                {results.skipped.length > 25 && (
                  <li className="italic">…and {results.skipped.length - 25} more</li>
                )}
              </ul>
            </div>
          )}

          <Button variant="outline" onClick={handleClear}>
            <X className="mr-1 h-4 w-4" />
            Import Another File
          </Button>
        </div>
      )}
    </div>
  );
}
