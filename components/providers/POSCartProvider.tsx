"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  calculateTaxBreakdown,
  type TaxBreakdown,
} from "@/convex/_helpers/taxCalculations";
import type { DiscountType } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CartItem = {
  variantId: Id<"variants">;
  styleName: string;
  size: string;
  color: string;
  quantity: number;
  unitPriceCentavos: number;
};

export type HeldTransaction = {
  id: string;
  label: string;
  items: CartItem[];
  heldAt: number;
  discountType: DiscountType;
  selectedPromoId: string | null;
};

type CartState = {
  items: CartItem[];
  heldTransactions: HeldTransaction[];
  activeTransactionId: string;
  discountType: DiscountType;
  selectedPromoId: string | null;
  holdCounter: number;
};

type CartAction =
  | { type: "ADD_ITEM"; payload: CartItem }
  | { type: "UPDATE_QUANTITY"; variantId: Id<"variants">; delta: number }
  | { type: "REMOVE_ITEM"; variantId: Id<"variants"> }
  | { type: "CLEAR_CART" }
  | { type: "HOLD_TRANSACTION" }
  | { type: "RESUME_TRANSACTION"; transactionId: string }
  | { type: "DISCARD_HELD"; transactionId: string }
  | { type: "RESTORE_HELD"; heldTransactions: HeldTransaction[]; holdCounter: number }
  | { type: "SET_DISCOUNT_TYPE"; discountType: DiscountType }
  | { type: "SET_PROMO"; promoId: string | null }
  | { type: "RESTORE_CART"; items: CartItem[]; discountType: DiscountType };

type POSCartContextValue = {
  items: CartItem[];
  heldTransactions: HeldTransaction[];
  activeTransactionId: string;
  addItem: (
    variantId: Id<"variants">,
    priceCentavos: number,
    styleName: string,
    size: string,
    color: string
  ) => "added" | "duplicate";
  updateQuantity: (variantId: Id<"variants">, delta: number) => void;
  removeItem: (variantId: Id<"variants">) => void;
  clearCart: () => void;
  holdTransaction: () => string | null;
  resumeTransaction: (id: string) => void;
  discardHeldTransaction: (id: string) => void;
  restoreCart: (items: CartItem[], discountType: DiscountType) => void;
  discountType: DiscountType;
  setDiscountType: (type: DiscountType) => void;
  selectedPromoId: string | null;
  setPromoId: (promoId: string | null) => void;
  taxBreakdown: TaxBreakdown;
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

let transactionCounter = 0;
function generateTransactionId(): string {
  transactionCounter += 1;
  return `txn-${Date.now()}-${transactionCounter}`;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const existing = state.items.find(
        (item) => item.variantId === action.payload.variantId
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.variantId === action.payload.variantId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.payload, quantity: 1 }],
      };
    }

    case "UPDATE_QUANTITY": {
      const newItems = state.items
        .map((item) =>
          item.variantId === action.variantId
            ? { ...item, quantity: item.quantity + action.delta }
            : item
        )
        .filter((item) => item.quantity > 0);
      return { ...state, items: newItems };
    }

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter(
          (item) => item.variantId !== action.variantId
        ),
      };

    case "CLEAR_CART":
      return { ...state, items: [], discountType: "none", selectedPromoId: null };

    case "HOLD_TRANSACTION": {
      if (state.items.length === 0) return state;
      if (state.heldTransactions.length >= 5) return state;
      const nextCounter = state.holdCounter + 1;
      const held: HeldTransaction = {
        id: state.activeTransactionId,
        label: `Hold #${nextCounter}`,
        items: [...state.items],
        heldAt: Date.now(),
        discountType: state.discountType,
        selectedPromoId: state.selectedPromoId,
      };
      return {
        ...state,
        items: [],
        heldTransactions: [...state.heldTransactions, held],
        activeTransactionId: generateTransactionId(),
        discountType: "none",
        selectedPromoId: null,
        holdCounter: nextCounter,
      };
    }

    case "RESUME_TRANSACTION": {
      const toResume = state.heldTransactions.find(
        (t) => t.id === action.transactionId
      );
      if (!toResume) return state;

      const remainingHeld = state.heldTransactions.filter(
        (t) => t.id !== action.transactionId
      );

      // If current cart has items, hold it first
      if (state.items.length > 0) {
        const swapCounter = state.holdCounter + 1;
        const currentHeld: HeldTransaction = {
          id: state.activeTransactionId,
          label: `Hold #${swapCounter}`,
          items: [...state.items],
          heldAt: Date.now(),
          discountType: state.discountType,
          selectedPromoId: state.selectedPromoId,
        };
        return {
          items: toResume.items,
          heldTransactions: [...remainingHeld, currentHeld].slice(-5),
          activeTransactionId: toResume.id,
          discountType: toResume.discountType,
          selectedPromoId: toResume.selectedPromoId,
          holdCounter: swapCounter,
        };
      }

      return {
        ...state,
        items: toResume.items,
        heldTransactions: remainingHeld,
        activeTransactionId: toResume.id,
        discountType: toResume.discountType,
        selectedPromoId: toResume.selectedPromoId,
      };
    }

    case "SET_DISCOUNT_TYPE":
      // Mutual exclusion: Senior/PWD clears promo
      return {
        ...state,
        discountType: action.discountType,
        selectedPromoId: action.discountType !== "none" ? null : state.selectedPromoId,
      };

    case "SET_PROMO":
      return { ...state, selectedPromoId: action.promoId };

    case "DISCARD_HELD":
      return {
        ...state,
        heldTransactions: state.heldTransactions.filter(
          (t) => t.id !== action.transactionId
        ),
      };

    case "RESTORE_HELD":
      return {
        ...state,
        heldTransactions: action.heldTransactions,
        holdCounter: action.holdCounter,
      };

    case "RESTORE_CART":
      return { ...state, items: action.items, discountType: action.discountType };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const POSCartContext = createContext<POSCartContextValue | null>(null);

export function usePOSCart(): POSCartContextValue {
  const ctx = useContext(POSCartContext);
  if (!ctx) {
    throw new Error("usePOSCart must be used within a POSCartProvider");
  }
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

const HELD_STORAGE_KEY = "pos-held-transactions";

function saveHeldToStorage(held: HeldTransaction[], holdCounter: number) {
  try {
    localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify({ held, holdCounter }));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function loadHeldFromStorage(): { held: HeldTransaction[]; holdCounter: number } | null {
  try {
    const raw = localStorage.getItem(HELD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.held)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function clearHeldFromStorage() {
  try {
    localStorage.removeItem(HELD_STORAGE_KEY);
  } catch {
    // Silently ignore
  }
}

export function POSCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, undefined, () => {
    const saved = loadHeldFromStorage();
    return {
      items: [],
      heldTransactions: saved?.held ?? [],
      activeTransactionId: generateTransactionId(),
      discountType: "none" as DiscountType,
      selectedPromoId: null,
      holdCounter: saved?.holdCounter ?? 0,
    };
  });

  // Refs for stable callback identities (avoid re-renders on every cart change)
  const itemsRef = useRef(state.items);
  itemsRef.current = state.items;
  const activeIdRef = useRef(state.activeTransactionId);
  activeIdRef.current = state.activeTransactionId;
  const heldRef = useRef(state.heldTransactions);
  heldRef.current = state.heldTransactions;

  const addItem = useCallback(
    (
      variantId: Id<"variants">,
      priceCentavos: number,
      styleName: string,
      size: string,
      color: string
    ): "added" | "duplicate" => {
      const isDuplicate = itemsRef.current.some(
        (item) => item.variantId === variantId
      );
      dispatch({
        type: "ADD_ITEM",
        payload: { variantId, unitPriceCentavos: priceCentavos, styleName, size, color, quantity: 1 },
      });
      return isDuplicate ? "duplicate" : "added";
    },
    []
  );

  const updateQuantity = useCallback(
    (variantId: Id<"variants">, delta: number) => {
      dispatch({ type: "UPDATE_QUANTITY", variantId, delta });
    },
    []
  );

  const removeItem = useCallback((variantId: Id<"variants">) => {
    dispatch({ type: "REMOVE_ITEM", variantId });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR_CART" });
  }, []);

  const holdTransaction = useCallback((): string | null => {
    if (itemsRef.current.length === 0) return null;
    if (heldRef.current.length >= 5) return null;
    dispatch({ type: "HOLD_TRANSACTION" });
    return activeIdRef.current;
  }, []);

  const resumeTransaction = useCallback((id: string) => {
    dispatch({ type: "RESUME_TRANSACTION", transactionId: id });
  }, []);

  const discardHeldTransaction = useCallback((id: string) => {
    dispatch({ type: "DISCARD_HELD", transactionId: id });
  }, []);

  const setDiscountType = useCallback(
    (discountType: DiscountType) => {
      dispatch({ type: "SET_DISCOUNT_TYPE", discountType });
    },
    []
  );

  const setPromoId = useCallback(
    (promoId: string | null) => {
      dispatch({ type: "SET_PROMO", promoId });
    },
    []
  );

  const restoreCart = useCallback(
    (items: CartItem[], discountType: DiscountType) => {
      dispatch({ type: "RESTORE_CART", items, discountType });
    },
    []
  );

  // Persist held transactions to localStorage
  useEffect(() => {
    if (state.heldTransactions.length > 0) {
      saveHeldToStorage(state.heldTransactions, state.holdCounter);
    } else {
      clearHeldFromStorage();
    }
  }, [state.heldTransactions, state.holdCounter]);

  const taxBreakdown = useMemo(
    () => calculateTaxBreakdown(state.items, state.discountType),
    [state.items, state.discountType]
  );

  return (
    <POSCartContext.Provider
      value={{
        items: state.items,
        heldTransactions: state.heldTransactions,
        activeTransactionId: state.activeTransactionId,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        holdTransaction,
        resumeTransaction,
        discardHeldTransaction,
        restoreCart,
        discountType: state.discountType,
        setDiscountType,
        selectedPromoId: state.selectedPromoId,
        setPromoId,
        taxBreakdown,
      }}
    >
      {children}
    </POSCartContext.Provider>
  );
}
