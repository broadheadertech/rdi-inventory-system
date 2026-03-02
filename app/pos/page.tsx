"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { POSProductGrid } from "@/components/pos/POSProductGrid";
import { POSCartPanel } from "@/components/pos/POSCartPanel";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { ScanConfirmation, type ScanResult } from "@/components/pos/ScanConfirmation";
import { POSCartProvider, usePOSCart } from "@/components/providers/POSCartProvider";
import { useConnectionStatus } from "@/components/shared/ConnectionIndicator";
import type { Id } from "@/convex/_generated/dataModel";
import type { DiscountType } from "@/lib/constants";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import {
  saveCart,
  getCart,
  clearCart as clearSavedCart,
  saveStockSnapshot,
  getStockSnapshot,
  clearStockSnapshot,
  type OfflineCartState,
} from "@/lib/offlineQueue";

export default function PosPage() {
  return (
    <POSCartProvider>
      <PosPageContent />
    </POSCartProvider>
  );
}

function PosPageContent() {
  const convex = useConvex();
  const { addItem, items, discountType, restoreCart } = usePOSCart();
  const connectionStatus = useConnectionStatus();
  const currentUser = useQuery(api.auth.users.getCurrentUser);

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Task 4.6: Offline stock display — null when online, snapshot map when offline
  const [offlineStock, setOfflineStock] = useState<Record<string, number> | null>(null);

  // Scanner state
  const [scannerActive, setScannerActive] = useState(true);
  const [scanResult, setScanResult] = useState<ScanResult>(null);

  // Debounced search with useRef — no extra re-renders, proper cleanup
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

  // Queries
  const products = useQuery(api.pos.products.searchPOSProducts, {
    searchText: debouncedSearch || undefined,
    brandId: selectedBrandId
      ? (selectedBrandId as Id<"brands">)
      : undefined,
    categoryId: selectedCategoryId
      ? (selectedCategoryId as Id<"categories">)
      : undefined,
  });

  const brands = useQuery(api.pos.products.listPOSBrands);
  const categories = useQuery(
    api.pos.products.listPOSCategories,
    selectedBrandId ? { brandId: selectedBrandId as Id<"brands"> } : {}
  );

  // Keep a ref to latest products for the offline event handler (avoids stale closure)
  const productsRef = useRef(products);
  productsRef.current = products;

  // Task 4.4: Cart + stock restore on mount when device is already offline
  // M1 fix: use connectionStatus (Convex connectivity) not navigator.onLine (network only)
  // so offline-according-to-Convex triggers the restore even if the browser sees a network
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

    // Load stock snapshot for display
    getStockSnapshot(branchIdStr)
      .then((snapshot) => {
        if (snapshot) setOfflineStock(snapshot);
      })
      .catch(() => {});

    // Restore saved cart items
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

  // Task 4.5: Snapshot stock on going offline; clear snapshot on reconnect
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

  // Task 4.3: Cart persistence on every cart change while offline.
  // When items go to 0 (after offline sale): clear saved cart + refresh stock display.
  useEffect(() => {
    if (connectionStatus !== "offline" || !currentUser?.branchId) return;
    const branchId = String(currentUser.branchId);

    if (items.length === 0) {
      // Cart cleared after offline sale — remove persisted cart, refresh stock display
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

  // Add to cart from product grid (size pill tap)
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

  // Barcode scan handler
  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      setScanResult({ type: "loading" });
      try {
        const variant = await convex.query(
          api.pos.products.getVariantByBarcode,
          { barcode }
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

  const handleDismissScan = useCallback(() => {
    setScanResult(null);
  }, []);

  // Memoize filter chips as simple objects
  const brandChips = useMemo(
    () => brands?.map((b) => ({ _id: b._id as string, name: b.name })),
    [brands]
  );
  const categoryChips = useMemo(
    () => categories?.map((c) => ({ _id: c._id as string, name: c.name })),
    [categories]
  );

  // Task 4.6: Merge offline stock snapshot into products for display when offline
  const displayProducts = useMemo(() => {
    if (!offlineStock || !products) return products;
    return products.map((product) => ({
      ...product,
      sizes: product.sizes.map((size) => ({
        ...size,
        stock: offlineStock[String(size.variantId)] ?? size.stock,
      })),
    }));
  }, [products, offlineStock]);

  return (
    <>
      <main className="flex h-screen">
        {/* Product grid — full width on small screens, 65% on large */}
        <div className="flex-1 overflow-hidden lg:flex-[65] lg:border-r">
          <div className="flex h-full flex-col">
            {/* Barcode scanner + EOD link */}
            <div className="border-b p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <BarcodeScanner
                    onScan={handleBarcodeScan}
                    isActive={scannerActive}
                  />
                </div>
                <Link
                  href="/pos/reconciliation"
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">End of Day</span>
                </Link>
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

            {/* Product grid */}
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
          </div>
        </div>

        {/* Cart panel — hidden on small screens, 35% right panel on large */}
        <div className="hidden lg:flex lg:flex-[35]">
          <POSCartPanel variant="desktop" />
        </div>
      </main>

      {/* Bottom sheet cart for small screens — rendered outside flex layout */}
      <div className="lg:hidden">
        <POSCartPanel variant="mobile" />
      </div>

      {/* Scan confirmation overlay */}
      <ScanConfirmation result={scanResult} onDismiss={handleDismissScan} />
    </>
  );
}
