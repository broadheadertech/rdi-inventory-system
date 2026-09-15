"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useConvex } from "convex/react";
import { api as _api } from "@/convex/_generated/api";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = _api as any;
import { POSProductGrid } from "@/components/pos/POSProductGrid";
import { POSCartPanel } from "@/components/pos/POSCartPanel";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { ScanConfirmation, type ScanResult } from "@/components/pos/ScanConfirmation";
import { ReadingReport, type ReadingData } from "@/components/pos/ReadingReport";
import { POSCartProvider, usePOSCart } from "@/components/providers/POSCartProvider";
import { ShiftGate, type ClosedShift } from "@/components/pos/ShiftGate";
import { EndShiftDialog } from "@/components/pos/EndShiftDialog";
import { getDeviceToken } from "@/lib/deviceToken";
import { useConnectionStatus } from "@/components/shared/ConnectionIndicator";
import type { Id } from "@/convex/_generated/dataModel";
import type { DiscountType } from "@/lib/constants";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import {
  ClipboardCheck,
  ScanBarcode,
  Radio,
  LayoutGrid,
  DollarSign,
  FileBarChart,
  X,
  Zap,
} from "lucide-react";
import {
  saveCart,
  getCart,
  clearCart as clearSavedCart,
  saveStockSnapshot,
  getStockSnapshot,
  clearStockSnapshot,
  type OfflineCartState,
} from "@/lib/offlineQueue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCentavos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type InputMode = "barcode" | "rfid" | "browse";

const INPUT_MODES: { value: InputMode; label: string; icon: typeof ScanBarcode }[] = [
  { value: "barcode", label: "Barcode", icon: ScanBarcode },
  { value: "rfid", label: "RFID", icon: Radio },
  { value: "browse", label: "Browse", icon: LayoutGrid },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Page wrapper
// ═══════════════════════════════════════════════════════════════════════════════

export default function PosPage() {
  return (
    <POSCartProvider>
      <PosPageContent />
    </POSCartProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main POS Content
// ═══════════════════════════════════════════════════════════════════════════════

function PosPageContent() {
  const convex = useConvex();
  const { addItem, items, discountType, restoreCart } = usePOSCart();
  const connectionStatus = useConnectionStatus();
  const currentUser = useQuery(api.auth.users.getCurrentUser);

  // Rush mode (localStorage-backed)
  const [isRushMode, setIsRushMode] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("rb-pos-rush-mode");
    if (stored === "true") setIsRushMode(true);
  }, []);
  const toggleRushMode = useCallback(() => {
    setIsRushMode((prev) => {
      const next = !prev;
      localStorage.setItem("rb-pos-rush-mode", next ? "true" : "false");
      return next;
    });
  }, []);

  // Mode state
  const [inputMode, setInputMode] = useState<InputMode>("barcode");

  // Browse mode filters
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Offline stock display
  const [offlineStock, setOfflineStock] = useState<Record<string, number> | null>(null);

  // Scanner state
  const [scannerActive, setScannerActive] = useState(true);
  const [scanResult, setScanResult] = useState<ScanResult>(null);

  // Scan input ref — auto-focused for USB barcode guns / RFID readers
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanCode, setScanCode] = useState("");

  // Debounced search
  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Keep scan input focused in scan modes
  useEffect(() => {
    if (inputMode !== "browse" && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [inputMode, scanResult]);

  // Re-focus scan input after scan result dismisses
  useEffect(() => {
    if (scanResult === null && inputMode !== "browse" && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [scanResult, inputMode]);

  // Queries — skip product grid fetch in scan modes
  const products = useQuery(
    api.pos.products.searchPOSProducts,
    inputMode === "browse"
      ? {
          searchText: debouncedSearch || undefined,
          brandId: selectedBrandId ? (selectedBrandId as Id<"brands">) : undefined,
          categoryId: selectedCategoryId ? (selectedCategoryId as Id<"categories">) : undefined,
        }
      : "skip"
  );

  const brands = useQuery(
    api.pos.products.listPOSBrands,
    inputMode === "browse" ? {} : "skip"
  );
  const categories = useQuery(
    api.pos.products.listPOSCategories,
    inputMode === "browse" && selectedBrandId
      ? { brandId: selectedBrandId as Id<"brands"> }
      : inputMode === "browse"
      ? {}
      : "skip"
  );

  // Shift data for cash balance display — terminal-scoped, same as the gate.
  const [posDeviceToken, setPosDeviceToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setPosDeviceToken(getDeviceToken());
  }, []);
  const shift = useQuery(
    api.pos.shifts.getActiveShift,
    posDeviceToken === undefined ? "skip" : { deviceToken: posDeviceToken ?? undefined }
  );
  // X-Reading modal
  const [showXReading, setShowXReading] = useState(false);
  // The shift's GCash, Maya and bank transfer takings, live in the header.
  const tenders = useQuery(
    api.pos.shifts.getShiftTenders,
    shift ? { deviceToken: posDeviceToken ?? undefined } : "skip"
  );

  const xReading = useQuery(
    api.pos.readings.getXReading,
    showXReading ? {} : "skip"
  );

  // End Shift: declare the drawer, then switch cashier or end the day.
  const [showEndShift, setShowEndShift] = useState(false);
  // The shift that just ended, handed to the gate so it can say who logged out.
  const [lastClosed, setLastClosed] = useState<ClosedShift | null>(null);

  // Keep ref for offline handlers
  const productsRef = useRef(products);
  productsRef.current = products;

  // ── Offline restore on mount ────────────────────────────────────────────────
  const initDoneRef = useRef(false);
  useEffect(() => {
    if (initDoneRef.current || !currentUser) return;
    if (connectionStatus !== "offline") {
      initDoneRef.current = true;
      return;
    }
    initDoneRef.current = true;

    const branchId = currentUser.branchId;
    if (!branchId) return;
    const branchIdStr = String(branchId);

    getStockSnapshot(branchIdStr)
      .then((snapshot) => {
        if (snapshot) setOfflineStock(snapshot);
      })
      .catch(() => {});

    getCart(branchIdStr)
      .then((saved) => {
        if (saved && saved.items.length > 0) {
          restoreCart(
            saved.items.map((i) => ({
              variantId: i.variantId as Id<"variants">,
              styleName: i.styleName,
              size: i.size,
              color: i.color,
              quantity: i.quantity,
              unitPriceCentavos: i.unitPriceCentavos,
            })),
            saved.discountType as DiscountType
          );
        }
      })
      .catch(() => {});
  }, [currentUser, restoreCart, connectionStatus]);

  // ── Snapshot stock on offline ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.branchId) return;
    const branchId = String(currentUser.branchId);

    function handleOffline() {
      const snapshot: Record<string, number> = {};
      if (productsRef.current) {
        for (const product of productsRef.current) {
          for (const size of product.sizes) {
            snapshot[String(size.variantId)] = size.stock;
          }
        }
      }
      saveStockSnapshot(branchId, snapshot)
        .then(() => setOfflineStock(snapshot))
        .catch(() => {});
    }

    function handleOnline() {
      clearStockSnapshot(branchId).catch(() => {});
      setOfflineStock(null);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [currentUser?.branchId]);

  // ── Cart persistence while offline ──────────────────────────────────────────
  useEffect(() => {
    if (connectionStatus !== "offline" || !currentUser?.branchId) return;
    const branchId = String(currentUser.branchId);

    if (items.length === 0) {
      clearSavedCart(branchId).catch(() => {});
      getStockSnapshot(branchId)
        .then((snapshot) => {
          if (snapshot) setOfflineStock(snapshot);
        })
        .catch(() => {});
    } else {
      const cartToSave: OfflineCartState = {
        branchId,
        items: items.map((i) => ({
          variantId: String(i.variantId),
          styleName: i.styleName,
          size: i.size,
          color: i.color,
          quantity: i.quantity,
          unitPriceCentavos: i.unitPriceCentavos,
        })),
        discountType,
        savedAt: Date.now(),
      };
      saveCart(cartToSave).catch(() => {});
    }
  }, [items, discountType, connectionStatus, currentUser?.branchId]);

  // ── Scan handler (shared between barcode + RFID) ────────────────────────────
  const handleCodeScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;

      setScanResult({ type: "loading" });
      try {
        const variant = await convex.query(
          api.pos.products.getVariantByCode,
          { code: trimmed }
        );

        if (!variant) {
          setScanResult({ type: "not-found" });
          return;
        }

        const result = addItem(
          variant.variantId,
          variant.priceCentavos,
          variant.styleName,
          variant.size,
          variant.color
        );

        setScanResult({
          type: result === "duplicate" ? "duplicate" : "success",
          styleName: variant.styleName,
          size: variant.size,
          color: variant.color,
          priceCentavos: variant.priceCentavos,
          stock: variant.stock,
        });
      } catch {
        setScanResult({ type: "not-found" });
      }
    },
    [convex, addItem]
  );

  // Camera barcode scan
  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      await handleCodeScan(barcode);
    },
    [handleCodeScan]
  );

  // Text input scan (USB gun / RFID types code + Enter)
  const handleScanInputSubmit = useCallback(() => {
    if (!scanCode.trim()) return;
    handleCodeScan(scanCode);
    setScanCode("");
  }, [scanCode, handleCodeScan]);

  // Add to cart from product grid
  const handleAddToCart = useCallback(
    (
      variantId: Id<"variants">,
      priceCentavos: number,
      styleName: string,
      size: string,
      color: string
    ) => {
      const result = addItem(variantId, priceCentavos, styleName, size, color);
      setScanResult({
        type: result === "duplicate" ? "duplicate" : "success",
        styleName,
        size,
        color,
        priceCentavos,
      });
    },
    [addItem]
  );

  const handleDismissScan = useCallback(() => {
    setScanResult(null);
  }, []);

  // Browse mode data
  const brandChips = useMemo(
    () => (brands as { _id: string; name: string }[] | undefined)?.map((b) => ({ _id: b._id as string, name: b.name })),
    [brands]
  );
  const categoryChips = useMemo(
    () => (categories as { _id: string; name: string }[] | undefined)?.map((c) => ({ _id: c._id as string, name: c.name })),
    [categories]
  );

  const displayProducts = useMemo(() => {
    if (!offlineStock || !products) return products;
    return (products as { sizes: { variantId: string; stock: number }[] }[]).map((product) => ({
      ...product,
      sizes: (product.sizes as { variantId: string; stock: number }[]).map((size) => ({
        ...size,
        stock: offlineStock[String(size.variantId)] ?? size.stock,
      })),
    }));
  }, [products, offlineStock]);

  return (
    <ShiftGate
      branchId={currentUser?.branchId ? String(currentUser.branchId) : null}
      lastClosed={lastClosed}
      onDismissClosed={() => setLastClosed(null)}
    >
      {isRushMode && (
        <div className="bg-amber-500 text-black text-center py-1 text-xs font-bold uppercase tracking-widest">
          <Zap className="inline h-3 w-3 mr-1" />
          Rush Mode Active — Quick Checkout Enabled
        </div>
      )}
      <main className={cn("flex", isRushMode ? "h-[calc(100vh-28px)] ring-2 ring-amber-500/60 ring-inset animate-pulse-subtle" : "h-screen")}>
        {/* Left panel — scan area or browse grid */}
        <div className="flex-1 overflow-hidden lg:flex-[60] lg:border-r">
          <div className="flex h-full flex-col">
            {/* ── Top bar: mode toggle + cash balance + EOD ──────────── */}
            <div className="border-b px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Mode pills */}
                <div className="flex gap-1">
                  {INPUT_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setInputMode(mode.value)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        inputMode === mode.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      <mode.icon className="h-3.5 w-3.5" />
                      {mode.label}
                    </button>
                  ))}
                </div>

                {/* Rush mode + Cash balance + actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleRushMode}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      isRushMode
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-muted bg-background text-muted-foreground hover:border-amber-500/50 hover:text-foreground"
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Rush
                  </button>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {shift && (
                    <button
                      onClick={() => setShowXReading(true)}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      <FileBarChart className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">X-Read</span>
                    </button>
                  )}
                  <Link
                    href="/pos/reconciliation"
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">EOD</span>
                  </Link>
                  {shift && (
                    <button
                      onClick={() => setShowEndShift(true)}
                      className="whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      End Shift
                    </button>
                  )}
                </div>

                {/* The shift at a glance: its own row, so it never squeezes the
                    buttons. COH is what the drawer should hold now; GCash, Maya
                    and bank transfers are checked against the apps and the bank. */}
                {shift && (
                  <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs">
                    <span className="font-medium text-foreground">{shift.cashierName}</span>
                    <span className="text-muted-foreground">
                      Txns: <span className="font-semibold text-foreground">{shift.transactionCount}</span>
                    </span>
                    {tenders && (
                      <>
                        <span className="border-l pl-4 text-muted-foreground">
                          COH:{" "}
                          <span className="font-semibold text-green-700">
                            {formatCurrency(tenders.drawer.expectedCentavos)}
                          </span>
                        </span>
                        <span className="border-l pl-4 text-muted-foreground">
                          GCash:{" "}
                          <span className="font-semibold text-blue-700">
                            {formatCurrency(tenders.gcash.amountCentavos)}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          Maya:{" "}
                          <span className="font-semibold text-emerald-700">
                            {formatCurrency(tenders.maya.amountCentavos)}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          Bank:{" "}
                          <span className="font-semibold text-amber-700">
                            {formatCurrency(tenders.bankTransfer.amountCentavos)}
                          </span>
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Scan modes: barcode / RFID ────────────────────────── */}
            {inputMode !== "browse" && (
              <div className="flex flex-col h-full">
                {/* Scan input area */}
                <div className="border-b p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      {inputMode === "barcode" ? (
                        <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      ) : (
                        <Radio className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      )}
                      <input
                        ref={scanInputRef}
                        type="text"
                        value={scanCode}
                        onChange={(e) => setScanCode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleScanInputSubmit();
                          }
                        }}
                        placeholder={
                          inputMode === "barcode"
                            ? "Scan barcode or type SKU..."
                            : "Waiting for RFID scan..."
                        }
                        className="w-full rounded-lg border bg-background py-3 pl-10 pr-4 text-base font-medium placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                        autoComplete="off"
                      />
                    </div>

                    {/* Camera scanner toggle (barcode mode only) */}
                    {inputMode === "barcode" && (
                      <div className="shrink-0">
                        <BarcodeScanner
                          onScan={handleBarcodeScan}
                          isActive={scannerActive}
                        />
                        {!scannerActive && (
                          <button
                            onClick={() => setScannerActive(true)}
                            className="mt-1 text-xs text-primary underline"
                          >
                            Enable camera
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground text-center">
                    {inputMode === "barcode"
                      ? "Point USB scanner at barcode or type SKU and press Enter"
                      : "Tap RFID tag on reader — code will auto-submit"}
                  </p>
                </div>

                {/* Scanned items table */}
                <div className="flex-1 overflow-y-auto p-3">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                      <DollarSign className="h-16 w-16 text-muted-foreground/20" />
                      <p className="text-sm font-medium text-muted-foreground">
                        No items scanned yet
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        Scan a barcode or RFID tag to add items
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium w-8">#</th>
                            <th className="px-3 py-2 font-medium">Product</th>
                            <th className="px-3 py-2 font-medium">Size / Color</th>
                            <th className="px-3 py-2 font-medium text-center">Qty</th>
                            <th className="px-3 py-2 font-medium text-right">Price</th>
                            <th className="px-3 py-2 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, i) => (
                            <tr
                              key={item.variantId as string}
                              className="border-b last:border-0 hover:bg-muted/20"
                            >
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {i + 1}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {item.styleName}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {item.size} · {item.color}
                              </td>
                              <td className="px-3 py-2 text-center font-semibold">
                                {item.quantity}
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                                {formatCentavos(item.unitPriceCentavos)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                {formatCentavos(item.unitPriceCentavos * item.quantity)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Browse mode: product grid (existing) ─────────────── */}
            {/* The camera scanner lives in Barcode mode; Browse is all products. */}
            {inputMode === "browse" && (
              <>
                <div className="flex-1 overflow-hidden">
                  <POSProductGrid
                    products={displayProducts}
                    brands={brandChips}
                    categories={categoryChips}
                    searchText={searchText}
                    onSearchChange={handleSearchChange}
                    selectedBrandId={selectedBrandId}
                    onBrandSelect={setSelectedBrandId}
                    selectedCategoryId={selectedCategoryId}
                    onCategorySelect={setSelectedCategoryId}
                    onAddToCart={handleAddToCart}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Cart panel — right side (desktop) */}
        <div className="hidden lg:flex lg:flex-[40]">
          <POSCartPanel variant="desktop" isRushMode={isRushMode} />
        </div>
      </main>

      {/* Bottom sheet cart for mobile */}
      <div className="lg:hidden">
        <POSCartPanel variant="mobile" isRushMode={isRushMode} />
      </div>

      {/* Scan confirmation overlay */}
      <ScanConfirmation result={scanResult} onDismiss={handleDismissScan} />

      {/* End Shift — forced open for a shift left open from an earlier day */}
      {shift && (showEndShift || shift.isPreviousDay) && (
        <EndShiftDialog
          shift={shift}
          onCancel={() => setShowEndShift(false)}
          onClosed={(closed) => {
            setShowEndShift(false);
            setLastClosed(closed);
          }}
        />
      )}

      {/* X-Reading Modal */}
      {showXReading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-white print:p-0">
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-5 shadow-xl print:max-w-none print:max-h-none print:border-none print:shadow-none print:rounded-none">
            <button
              onClick={() => setShowXReading(false)}
              className="absolute right-3 top-3 rounded-full p-1 hover:bg-muted print:hidden"
            >
              <X className="h-4 w-4" />
            </button>
            {xReading === undefined ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading X-Reading...</p>
              </div>
            ) : xReading === null ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No active shift found</p>
              </div>
            ) : (
              <ReadingReport
                data={xReading as ReadingData}
                onClose={() => setShowXReading(false)}
                hideCash
              />
            )}
          </div>
        </div>
      )}

    </ShiftGate>
  );
}
