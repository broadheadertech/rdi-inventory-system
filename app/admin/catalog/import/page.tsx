"use client";

import { useState, useRef, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

// ─── Constants ──────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const MAX_TOTAL_ROWS = 5000;

const REQUIRED_COLUMNS = [
  "brand",
  "category",
  "styleName",
  "basePricePesos",
  "sku",
  "size",
  "color",
  "pricePesos",
];

const ALL_COLUMNS = [
  "brand",
  "category",
  "styleName",
  "styleDescription",
  "basePricePesos",
  "sku",
  "barcode",
  "size",
  "color",
  "gender",
  "pricePesos",
];

const SAMPLE_CSV = `brand,category,styleName,styleDescription,basePricePesos,sku,barcode,size,color,gender,pricePesos
RedBox,T-Shirts,Classic Crew,Basic crew neck tee,299,RB-CC-S-RED,8901234567890,S,Red,unisex,299
RedBox,T-Shirts,Classic Crew,,299,RB-CC-M-RED,,M,Red,unisex,299
RedBox,T-Shirts,Classic Crew,,299,RB-CC-L-BLU,,L,Blue,unisex,319
RedBox,Polo Shirts,Sport Polo,Breathable sport polo,499,RB-SP-M-WHT,8901234567891,M,White,mens,499`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedRow {
  brand: string;
  category: string;
  styleName: string;
  styleDescription?: string;
  basePricePesos: string;
  sku: string;
  barcode?: string;
  size: string;
  color: string;
  gender?: string;
  pricePesos: string;
}

interface ImportError {
  rowIndex: number;
  sku: string;
  error: string;
}

interface ImportSkipped {
  rowIndex: number;
  sku: string;
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
  errors: ImportError[];
  skipped: ImportSkipped[];
  priceUpdates: PriceUpdate[];
  brandsCreated: number;
  categoriesCreated: number;
  stylesCreated: number;
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function BulkImportPage() {
  const bulkImport = useAction(api.catalog.bulkImport.bulkImportProducts);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Progress state
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);

  // Results state
  const [results, setResults] = useState<{
    successCount: number;
    skippedCount: number;
    priceUpdatedCount: number;
    failureCount: number;
    errors: ImportError[];
    skipped: ImportSkipped[];
    priceUpdates: PriceUpdate[];
    brandsCreated: number;
    categoriesCreated: number;
    stylesCreated: number;
  } | null>(null);

  // ─── CSV Parsing ────────────────────────────────────────────────────────

  const router = useRouter();
  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      error: (err) => {
        toast.error(`Failed to read file: ${err.message}`);
      },
      complete: (parseResult) => {
        const fatalErrors = parseResult.errors.filter(
          (e) => e.type !== "FieldMismatch"
        );
        if (fatalErrors.length > 0) {
          toast.error(
            `CSV parse errors: ${fatalErrors.map((e) => e.message).join(", ")}`
          );
          return;
        }
        if (parseResult.errors.length > 0) {
          toast.warning(
            `${parseResult.errors.length} row(s) had field mismatches and were included as-is. Review the preview carefully.`
          );
        }

        const fields = parseResult.meta.fields ?? [];

        // Auto-detect POS format and bounce the user to the POS importer if so.
        // POS exports are wide and use uppercase headers like "BRAND", "DEPARTMENT",
        // "Barcode / Product Code". Detect by looking for any of those headers.
        const fieldsNorm = fields.map((f) => f.trim().toUpperCase().replace(/\s+/g, " "));
        const POS_SIGNALS = [
          "BARCODE / PRODUCT CODE",
          "DEPARTMENT",
          "DIVISION",
          "SUBCATEGORY",
          "STYLE CODE",
          "ACTUAL COUNT",
          "SHORT PCH DESCRIPTION PCH (25 PCH CHARS)",
        ];
        const looksLikePos = POS_SIGNALS.some((s) => fieldsNorm.includes(s));
        if (looksLikePos) {
          try {
            sessionStorage.setItem(
              "pos-import-handoff",
              JSON.stringify({
                fileName: file.name,
                rows: parseResult.data,
              }),
            );
          } catch {
            // sessionStorage might be full; user will just have to re-drop the file
          }
          toast.info("Detected POS-format columns — opening the POS importer.");
          router.push("/admin/catalog/import/pos");
          return;
        }

        const missingColumns = REQUIRED_COLUMNS.filter(
          (col) => !fields.includes(col)
        );
        if (missingColumns.length > 0) {
          toast.error(
            `Missing required columns: ${missingColumns.join(", ")}. ` +
              `If you're uploading a POS-format export, use the POS-Format Import page instead.`,
          );
          return;
        }

        if (parseResult.data.length === 0) {
          toast.error("CSV file is empty");
          return;
        }

        if (parseResult.data.length > MAX_TOTAL_ROWS) {
          toast.error(
            `CSV has ${parseResult.data.length} rows. Maximum allowed is ${MAX_TOTAL_ROWS}.`
          );
          return;
        }

        setParsedRows(parseResult.data);
        setFileName(file.name);
        setResults(null);
        toast.success(`Parsed ${parseResult.data.length} rows from ${file.name}`);
      },
    });
  }, [router]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  // ─── Drag & Drop ───────────────────────────────────────────────────────

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

  // ─── Import ─────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (parsedRows.length === 0) return;

    setIsImporting(true);
    setResults(null);

    // Convert rows to action format
    const items = parsedRows.map((row) => ({
      brand: row.brand.trim(),
      category: row.category.trim(),
      styleName: row.styleName.trim(),
      styleDescription:
        row.styleDescription?.trim() || undefined,
      basePriceCentavos: Math.round(parseFloat(row.basePricePesos) * 100),
      sku: row.sku.trim(),
      barcode: row.barcode?.trim() || undefined,
      size: row.size.trim(),
      color: row.color.trim(),
      gender: row.gender?.trim().toLowerCase() || undefined,
      priceCentavos: Math.round(parseFloat(row.pricePesos) * 100),
    }));

    // Client-side validation
    const invalidRows: string[] = [];
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    items.forEach((item, i) => {
      if (!item.brand) invalidRows.push(`Row ${i + 1}: missing brand`);
      if (!item.category) invalidRows.push(`Row ${i + 1}: missing category`);
      if (!item.styleName) invalidRows.push(`Row ${i + 1}: missing styleName`);
      if (!item.sku) invalidRows.push(`Row ${i + 1}: missing sku`);
      else if (seenSkus.has(item.sku)) invalidRows.push(`Row ${i + 1}: duplicate SKU "${item.sku}"`);
      else seenSkus.add(item.sku);
      if (item.barcode) {
        if (seenBarcodes.has(item.barcode)) invalidRows.push(`Row ${i + 1}: duplicate barcode "${item.barcode}"`);
        else seenBarcodes.add(item.barcode);
      }
      if (!item.size) invalidRows.push(`Row ${i + 1}: missing size`);
      if (!item.color) invalidRows.push(`Row ${i + 1}: missing color`);
      if (isNaN(item.basePriceCentavos) || item.basePriceCentavos <= 0)
        invalidRows.push(`Row ${i + 1}: invalid basePricePesos`);
      if (isNaN(item.priceCentavos) || item.priceCentavos <= 0)
        invalidRows.push(`Row ${i + 1}: invalid pricePesos`);
    });

    if (invalidRows.length > 0) {
      toast.error(
        `Validation failed:\n${invalidRows.slice(0, 5).join("\n")}${invalidRows.length > 5 ? `\n...and ${invalidRows.length - 5} more` : ""}`
      );
      setIsImporting(false);
      return;
    }

    // Split into batches
    const batches: typeof items[] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }
    setTotalBatches(batches.length);

    // Process batches sequentially
    const aggregated = {
      successCount: 0,
      skippedCount: 0,
      priceUpdatedCount: 0,
      failureCount: 0,
      errors: [] as ImportError[],
      skipped: [] as ImportSkipped[],
      priceUpdates: [] as PriceUpdate[],
      brandsCreated: 0,
      categoriesCreated: 0,
      stylesCreated: 0,
    };

    try {
      for (let b = 0; b < batches.length; b++) {
        setCurrentBatch(b + 1);
        const batchResult: BatchResult = await bulkImport({
          items: batches[b],
        });

        aggregated.successCount += batchResult.successCount;
        aggregated.skippedCount += batchResult.skippedCount;
        aggregated.priceUpdatedCount += batchResult.priceUpdatedCount;
        aggregated.failureCount += batchResult.failureCount;
        aggregated.brandsCreated += batchResult.brandsCreated;
        aggregated.categoriesCreated += batchResult.categoriesCreated;
        aggregated.stylesCreated += batchResult.stylesCreated;

        // Adjust row indexes for batch offset
        const offset = b * BATCH_SIZE;
        batchResult.errors.forEach((err) => {
          aggregated.errors.push({
            ...err,
            rowIndex: err.rowIndex + offset,
          });
        });
        batchResult.skipped.forEach((s) => {
          aggregated.skipped.push({
            ...s,
            rowIndex: s.rowIndex + offset,
          });
        });
        batchResult.priceUpdates.forEach((p) => {
          aggregated.priceUpdates.push({
            ...p,
            rowIndex: p.rowIndex + offset,
          });
        });
      }

      if (aggregated.failureCount === 0 && aggregated.skippedCount === 0) {
        toast.success(
          `Import complete! ${aggregated.successCount} products imported successfully.`
        );
      } else if (aggregated.failureCount === 0) {
        toast.success(
          `Import complete! ${aggregated.successCount} imported, ${aggregated.skippedCount} skipped (already exist).`
        );
      } else {
        toast.warning(
          `Import complete: ${aggregated.successCount} succeeded, ${aggregated.skippedCount} skipped, ${aggregated.failureCount} failed.`
        );
      }
    } catch (error) {
      toast.error(`Batch ${currentBatch} failed: ${getErrorMessage(error)}. Results from earlier batches are shown below.`);
    } finally {
      setResults(aggregated);
      setIsImporting(false);
      setCurrentBatch(0);
      setTotalBatches(0);
    }
  };

  // ─── Download Sample CSV ───────────────────────────────────────────────

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Clear / Reset ────────────────────────────────────────────────────

  const handleClear = () => {
    setParsedRows([]);
    setFileName("");
    setResults(null);
  };

  // ─── Computed Values ──────────────────────────────────────────────────

  const uniqueBrands = new Set(parsedRows.map((r) => r.brand.trim().toLowerCase())).size;
  const uniqueCategories = new Set(
    parsedRows.map((r) => `${r.brand.trim().toLowerCase()}::${r.category.trim().toLowerCase()}`)
  ).size;
  const uniqueStyles = new Set(
    parsedRows.map(
      (r) =>
        `${r.brand.trim().toLowerCase()}::${r.category.trim().toLowerCase()}::${r.styleName.trim().toLowerCase()}`
    )
  ).size;
  const previewRows = parsedRows.slice(0, 5);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/catalog">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Catalog
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bulk Product Import</h1>
          <p className="text-sm text-muted-foreground">
            Simple CSV format. Need the wide POS export columns?{" "}
            <Link href="/admin/catalog/import/pos" className="underline hover:text-foreground">
              Use POS-Format Import →
            </Link>
          </p>
        </div>
        <Button variant="outline" onClick={handleDownloadSample}>
          <Download className="mr-2 h-4 w-4" />
          Download Sample CSV
        </Button>
      </div>

      {/* Upload Zone */}
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
            Supports .csv files up to {MAX_TOTAL_ROWS.toLocaleString()} rows
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

      {/* Preview Section */}
      {parsedRows.length > 0 && !results && (
        <>
          {/* Summary Bar */}
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">{fileName}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{parsedRows.length} rows</span>
                <span>{uniqueBrands} brand{uniqueBrands !== 1 ? "s" : ""}</span>
                <span>{uniqueCategories} categor{uniqueCategories !== 1 ? "ies" : "y"}</span>
                <span>{uniqueStyles} style{uniqueStyles !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
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

          {/* Preview Table */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Preview (first {previewRows.length} of {parsedRows.length} rows)
            </p>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">#</TableHead>
                    {ALL_COLUMNS.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                        {REQUIRED_COLUMNS.includes(col) && (
                          <span className="text-destructive ml-0.5">*</span>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      {ALL_COLUMNS.map((col) => (
                        <TableCell key={col} className="whitespace-nowrap">
                          {(row as unknown as Record<string, string>)[col] || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Results Section */}
      {results && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-md border p-6">
            <div className="flex items-center gap-3 mb-4">
              {results.failureCount === 0 && results.skippedCount === 0 ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : results.failureCount === 0 ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <AlertCircle className="h-6 w-6 text-yellow-600" />
              )}
              <h2 className="text-lg font-semibold">Import Complete</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Succeeded</p>
                <p className="text-2xl font-bold text-green-600">
                  {results.successCount}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Price Updated</p>
                <p className="text-2xl font-bold text-blue-600">
                  {results.priceUpdatedCount}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Skipped</p>
                <p className="text-2xl font-bold text-amber-600">
                  {results.skippedCount}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-destructive">
                  {results.failureCount}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Brands Created</p>
                <p className="text-2xl font-bold">{results.brandsCreated}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categories Created</p>
                <p className="text-2xl font-bold">{results.categoriesCreated}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Styles Created</p>
                <p className="text-2xl font-bold">{results.stylesCreated}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Rows</p>
                <p className="text-2xl font-bold">{parsedRows.length}</p>
              </div>
            </div>
          </div>

          {/* Error Table */}
          {results.errors.length > 0 && (
            <div>
              <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Failed Rows ({results.errors.length})
              </h3>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.errors.map((err, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="destructive">{err.rowIndex + 1}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {err.sku}
                        </TableCell>
                        <TableCell className="text-destructive">
                          {err.error}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Skipped Table */}
          {results.skipped.length > 0 && (
            <div>
              <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Skipped Rows ({results.skipped.length})
              </h3>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.skipped.map((s, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="outline" className="border-amber-300 text-amber-700">{s.rowIndex + 1}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {s.sku}
                        </TableCell>
                        <TableCell className="text-amber-600">
                          {s.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Import More */}
          <div className="flex items-center gap-3">
            <Button onClick={handleClear}>
              <Upload className="mr-2 h-4 w-4" />
              Import More
            </Button>
            <Link href="/admin/catalog">
              <Button variant="outline">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back to Catalog
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
