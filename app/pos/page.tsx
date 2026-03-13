"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useConvex, useMutation, useAction } from "convex/react";
import { api as _api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = _api as any;
import { POSProductGrid } from "@/components/pos/POSProductGrid";
import { POSCartPanel } from "@/components/pos/POSCartPanel";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { ScanConfirmation, type ScanResult } from "@/components/pos/ScanConfirmation";
import { ReadingReport, type ReadingData } from "@/components/pos/ReadingReport";
import { POSCartProvider, usePOSCart } from "@/components/providers/POSCartProvider";
import { useConnectionStatus } from "@/components/shared/ConnectionIndicator";
import type { Id } from "@/convex/_generated/dataModel";
import type { DiscountType } from "@/lib/constants";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  ScanBarcode,
  Radio,
  LayoutGrid,
  Wallet,
  DollarSign,
  FileBarChart,
  X,
  Zap,
  LogIn,
  ArrowRight,
  Users,
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
// Shift Gate — multi-step: login → handover → funds
// ═══════════════════════════════════════════════════════════════════════════════

type ShiftGateStep = "login" | "handover" | "funds";

type VerifiedAccount = {
  cashierAccountId: string;
  firstName: string;
  lastName: string;
};

function ShiftGate({
  children,
  branchId,
}: {
  children: React.ReactNode;
  branchId: string | null | undefined;
}) {
  const shift = useQuery(api.pos.shifts.getActiveShift);
  const prevHandover = useQuery(api.cashier.auth.getPrevShiftHandover);
  const openShift = useMutation(api.pos.shifts.openShift);
  const verifyCashierLogin = useAction(api.cashier.authActions.verifyCashierLogin);

  const [step, setStep] = useState<ShiftGateStep>("login");
  const [verifiedAccount, setVerifiedAccount] = useState<VerifiedAccount | null>(null);

  // Login step state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Fund step state
  const [changeFundInput, setChangeFundInput] = useState("");
  const [cashFundInput, setCashFundInput] = useState("0");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Loading
  if (shift === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading shift...</p>
      </div>
    );
  }

  // Shift is open — render POS
  if (shift !== null) {
    return <>{children}</>;
  }

  // ── Step 1: Cashier login ───────────────────────────────────────────────────
  async function handleLogin() {
    if (!branchId) return;
    if (!username.trim() || !password.trim()) {
      setLoginError("Enter your username and password");
      return;
    }
    setIsSubmitting(true);
    setLoginError("");
    try {
      const account = await verifyCashierLogin({
        branchId,
        username: username.trim(),
        password,
      });
      setVerifiedAccount(account);
      // Go to handover step if there's a prev shift, otherwise straight to funds
      if (prevHandover) {
        setStep("handover");
      } else {
        setStep("funds");
      }
    } catch (err) {
      setLoginError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Step 3: Open shift ──────────────────────────────────────────────────────
  async function handleOpenShift() {
    if (!verifiedAccount) return;
    const changeCents = Math.round(parseFloat(changeFundInput || "0") * 100);
    const cashCents = Math.round(parseFloat(cashFundInput || "0") * 100);
    if (changeCents < 0 || cashCents < 0) return;
    setIsSubmitting(true);
    try {
      await openShift({
        cashierAccountId: verifiedAccount.cashierAccountId,
        changeFundCentavos: changeCents,
        cashFundCentavos: cashCents,
        prevShiftId: prevHandover?.shiftId ?? undefined,
        handoverCashInRegisterCentavos: prevHandover?.cashInRegisterCentavos ?? undefined,
        handoverChangeFundCentavos: prevHandover?.changeFundCentavos ?? undefined,
        handoverCashFundCentavos: prevHandover?.cashFundCentavos ?? undefined,
      });
    } catch {
      // handled by Convex
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Shared card wrapper ─────────────────────────────────────────────────────
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 space-y-5 shadow-lg">

        {/* ── Step 1: Login ──────────────────────────────────────────────── */}
        {step === "login" && (
          <>
            <div className="text-center space-y-1">
              <LogIn className="mx-auto h-10 w-10 text-primary" />
              <h1 className="text-xl font-bold">Cashier Login</h1>
              <p className="text-sm text-muted-foreground">Enter your credentials to open a shift</p>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setLoginError(""); }}
                placeholder="Username"
                autoComplete="username"
                autoFocus
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLoginError(""); }}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
              />
              {loginError && (
                <p className="text-xs text-red-500 text-center">{loginError}</p>
              )}
            </div>
            <button
              onClick={handleLogin}
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? "Verifying..." : "Continue"}
            </button>
          </>
        )}

        {/* ── Step 2: Handover ───────────────────────────────────────────── */}
        {step === "handover" && prevHandover && verifiedAccount && (
          <>
            <div className="text-center space-y-1">
              <Users className="mx-auto h-10 w-10 text-amber-500" />
              <h1 className="text-xl font-bold">Shift Handover</h1>
              <p className="text-sm text-muted-foreground">
                From <span className="font-medium text-foreground">{prevHandover.cashierName}</span>
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 divide-y text-sm">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Cash in Register</span>
                <span className="font-bold text-green-700">
                  ₱{(prevHandover.cashInRegisterCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Change Fund</span>
                <span className="font-semibold">
                  ₱{(prevHandover.changeFundCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Cash Fund (Expenses)</span>
                <span className="font-semibold">
                  ₱{(prevHandover.cashFundCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Count the cash in the drawer and confirm before proceeding.
            </p>
            <button
              onClick={() => setStep("funds")}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Acknowledge & Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </>
        )}

        {/* ── Step 3: Set funds ──────────────────────────────────────────── */}
        {step === "funds" && verifiedAccount && (
          <>
            <div className="text-center space-y-1">
              <Wallet className="mx-auto h-10 w-10 text-primary" />
              <h1 className="text-xl font-bold">Open Shift</h1>
              <p className="text-sm text-muted-foreground">
                Welcome, <span className="font-medium text-foreground">{verifiedAccount.firstName}</span>
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Change Fund (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={changeFundInput}
                  onChange={(e) => setChangeFundInput(e.target.value)}
                  placeholder="e.g. 2000"
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleOpenShift(); }}
                />
                <p className="mt-1 text-xs text-muted-foreground">Starting bills & coins for making change</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Cash Fund — Expenses (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashFundInput}
                  onChange={(e) => setCashFundInput(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => { if (e.key === "Enter") handleOpenShift(); }}
                />
                <p className="mt-1 text-xs text-muted-foreground">Petty cash for store expenses</p>
              </div>
            </div>
            <button
              onClick={handleOpenShift}
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? "Opening..." : "Open Shift"}
            </button>
          </>
        )}

      </div>
    </div>
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

  // Shift data for cash balance display
  const shift = useQuery(api.pos.shifts.getActiveShift);
  const closeShiftMut = useMutation(api.pos.shifts.closeShift);

  // X-Reading / Y-Reading modals
  const [showXReading, setShowXReading] = useState(false);
  const [yReadingShiftId, setYReadingShiftId] = useState<Id<"cashierShifts"> | null>(null);

  // End Shift modal
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [isClosingShift, setIsClosingShift] = useState(false);

  const xReading = useQuery(
    api.pos.readings.getXReading,
    showXReading ? {} : "skip"
  );
  const yReading = useQuery(
    api.pos.readings.getYReading,
    yReadingShiftId ? { shiftId: yReadingShiftId } : "skip"
  );

  const handleEndShift = useCallback(async (closeType: "turnover" | "endOfDay") => {
    setIsClosingShift(true);
    try {
      const result = await closeShiftMut({ closeType });
      setShowEndShiftModal(false);
      if (result?.shiftId) {
        setYReadingShiftId(result.shiftId);
      }
    } catch {
      // Error handled by Convex
    } finally {
      setIsClosingShift(false);
    }
  }, [closeShiftMut]);

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
    <ShiftGate branchId={currentUser?.branchId ? String(currentUser.branchId) : null}>
      {isRushMode && (
        <div className="bg-amber-500 text-black text-center py-1 text-xs font-bold uppercase tracking-widest">
          <Zap className="inline h-3 w-3 mr-1" />
          Rush Mode Active — Quick Checkout Enabled
        </div>
      )}
      <main className={cn("flex", isRushMode ? "h-[calc(100vh-28px)] ring-2 ring-amber-500/60 ring-inset animate-pulse-subtle" : "h-screen")}>
        {/* Left panel — scan area or browse grid */}
        <div className="flex-1 overflow-hidden lg:flex-[65] lg:border-r">
          <div className="flex h-full flex-col">
            {/* ── Top bar: mode toggle + cash balance + EOD ──────────── */}
            <div className="border-b px-3 py-2">
              <div className="flex items-center justify-between gap-2">
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

                <div className="flex items-center gap-2">
                  {shift && (
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs">
                      <span className="text-muted-foreground">
                        {shift.cashierName} — Fund: <span className="font-semibold text-foreground">{formatCentavos(shift.changeFundCentavos)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Cash: <span className="font-bold text-green-600">{formatCentavos(shift.cashInRegisterCentavos)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Txns: <span className="font-semibold text-foreground">{shift.transactionCount}</span>
                      </span>
                    </div>
                  )}
                  {shift && (
                    <button
                      onClick={() => setShowXReading(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      <FileBarChart className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">X-Read</span>
                    </button>
                  )}
                  <Link
                    href="/pos/reconciliation"
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">EOD</span>
                  </Link>
                  {shift && (
                    <button
                      onClick={() => setShowEndShiftModal(true)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      End Shift
                    </button>
                  )}
                </div>
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
            {inputMode === "browse" && (
              <>
                <div className="border-b p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <BarcodeScanner
                        onScan={handleBarcodeScan}
                        isActive={scannerActive}
                      />
                    </div>
                  </div>
                  {!scannerActive && (
                    <button
                      onClick={() => setScannerActive(true)}
                      className="text-sm text-primary underline"
                    >
                      Enable scanner
                    </button>
                  )}
                </div>

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
        <div className="hidden lg:flex lg:flex-[35]">
          <POSCartPanel variant="desktop" isRushMode={isRushMode} />
        </div>
      </main>

      {/* Bottom sheet cart for mobile */}
      <div className="lg:hidden">
        <POSCartPanel variant="mobile" isRushMode={isRushMode} />
      </div>

      {/* Scan confirmation overlay */}
      <ScanConfirmation result={scanResult} onDismiss={handleDismissScan} />

      {/* End Shift Modal */}
      {showEndShiftModal && shift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl space-y-5">
            <button
              onClick={() => setShowEndShiftModal(false)}
              className="absolute right-3 top-3 rounded-full p-1 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-center space-y-1">
              <Wallet className="mx-auto h-9 w-9 text-red-500" />
              <h2 className="text-lg font-bold">End Shift</h2>
              <p className="text-sm text-muted-foreground">
                {shift.cashierName}&apos;s shift summary
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 divide-y text-sm">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Change Fund</span>
                <span className="font-semibold">{formatCentavos(shift.changeFundCentavos)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Cash Sales</span>
                <span className="font-semibold">{formatCentavos(shift.cashSalesCentavos)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-green-50">
                <span className="font-medium text-green-800">Cash in Register</span>
                <span className="font-bold text-green-700">{formatCentavos(shift.cashInRegisterCentavos)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">GCash Sales</span>
                <span className="font-semibold">{formatCentavos(shift.gcashSalesCentavos)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Maya Sales</span>
                <span className="font-semibold">{formatCentavos(shift.mayaSalesCentavos)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Transactions</span>
                <span className="font-semibold">{shift.transactionCount}</span>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Choose how to end this shift:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleEndShift("turnover")}
                disabled={isClosingShift}
                className="flex flex-col items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                <Users className="h-5 w-5" />
                Cashier Turnover
                <span className="text-xs font-normal text-amber-600">Next cashier takes over</span>
              </button>
              <button
                onClick={() => handleEndShift("endOfDay")}
                disabled={isClosingShift}
                className="flex flex-col items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
              >
                <DollarSign className="h-5 w-5" />
                End of Day
                <span className="text-xs font-normal text-red-600">Store closes for the day</span>
              </button>
            </div>
          </div>
        </div>
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
              />
            )}
          </div>
        </div>
      )}

      {/* Y-Reading Modal (shown after End Shift) */}
      {yReadingShiftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-white print:p-0">
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-5 shadow-xl print:max-w-none print:max-h-none print:border-none print:shadow-none print:rounded-none">
            <button
              onClick={() => setYReadingShiftId(null)}
              className="absolute right-3 top-3 rounded-full p-1 hover:bg-muted print:hidden"
            >
              <X className="h-4 w-4" />
            </button>
            {yReading === undefined ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Generating Y-Reading...</p>
              </div>
            ) : (
              <ReadingReport
                data={yReading as ReadingData}
                onClose={() => setYReadingShiftId(null)}
              />
            )}
          </div>
        </div>
      )}
    </ShiftGate>
  );
}
