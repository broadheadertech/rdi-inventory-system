import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { requireTerminal } from "../_helpers/requireTerminal";
import { POS_ROLES, requireRole } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";
import { calculateTaxBreakdown } from "../_helpers/taxCalculations";
import { tenderValidator } from "../_helpers/tenders";
import { stackPromos } from "../_helpers/promoStacking";
import { readPromoRules } from "../_helpers/promoSettings";
import { requireShiftForSale } from "./shifts";
import { branchPrice } from "../_helpers/branchPricing";
import { toPromoInput, type CartItemForPromo } from "../_helpers/promoCalculations";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Issue the next continuous, non-resetting invoice serial.
 *
 * BIR assigns an SI series per registered machine, so each terminal keeps its
 * own counter; a device with no terminal falls back to the branch series that
 * predates terminal binding. The counter document is read and incremented
 * inside this serializable mutation, so concurrent sales cannot collide and the
 * series never resets.
 */
async function nextInvoiceNumber(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  terminalId: Id<"posTerminals"> | undefined
): Promise<string> {
  const counter = terminalId
    ? await ctx.db
        .query("invoiceCounters")
        .withIndex("by_terminal", (q) => q.eq("terminalId", terminalId))
        .unique()
    : (
        await ctx.db
          .query("invoiceCounters")
          .withIndex("by_branch", (q) => q.eq("branchId", branchId))
          .collect()
      ).find((c) => c.terminalId === undefined);

  let seq: number;
  if (counter) {
    seq = counter.nextSeq;
    await ctx.db.patch(counter._id, { nextSeq: seq + 1, updatedAt: Date.now() });
  } else {
    seq = 1;
    await ctx.db.insert("invoiceCounters", {
      branchId,
      terminalId,
      nextSeq: 2,
      updatedAt: Date.now(),
    });
  }

  return `SI-${String(seq).padStart(9, "0")}`;
}

// ─── Create Transaction ─────────────────────────────────────────────────────

export const createTransaction = mutation({
  args: {
    deviceToken: v.optional(v.string()),
    // Set when a sale queued offline is replayed: when it was rung.
    offlineQueuedAt: v.optional(v.number()),
    items: v.array(
      v.object({
        variantId: v.id("variants"),
        quantity: v.number(),
        unitPriceCentavos: v.number(),
      })
    ),
    paymentMethod: tenderValidator,
    discountType: v.union(
      v.literal("senior"),
      v.literal("pwd"),
      v.literal("none")
    ),
    amountTenderedCentavos: v.optional(v.number()),
    // One promotion (older tills and replayed offline sales) or several.
    promotionId: v.optional(v.id("promotions")),
    promotionIds: v.optional(v.array(v.id("promotions"))),
    splitPayment: v.optional(v.object({
      method: tenderValidator,
      amountCentavos: v.number(),
    })),
    // Required when either portion is paid by bank transfer.
    paymentReference: v.optional(v.string()),
    fashionAssistantId: v.optional(v.id("fashionAssistants")),
    // BIR Sold-To + SC/PWD details (optional, captured at checkout)
    customerName: v.optional(v.string()),
    customerTin: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    customerBusinessStyle: v.optional(v.string()),
    scPwdName: v.optional(v.string()),
    scPwdIdNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Auth gate
    const scope = await withBranchScope(ctx);
    if (!(POS_ROLES as readonly string[]).includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const branchId = scope.branchId!;

    // 1b. Which register rang this up, and the shift it belongs to. A sale
    //     outside a shift has no cashier and falls in no drawer count.
    const terminal = await requireTerminal(ctx, args.deviceToken, branchId);
    await requireShiftForSale(ctx, branchId, terminal?._id ?? null, args.offlineQueuedAt);

    // 2. Validate non-empty cart (M1)
    if (args.items.length === 0) {
      throw new ConvexError({
        code: "INVALID_PAYMENT",
        message: "Cart is empty",
      });
    }

    // 3. Validate quantities are positive integers (H3)
    for (const item of args.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Invalid item quantity",
        });
      }
    }

    // 4. Validate cash payment has amount tendered
    if (args.paymentMethod === "cash") {
      if (args.amountTenderedCentavos === undefined) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Cash payment requires amount tendered",
        });
      }
    }

    // 4b. Validate split payment
    if (args.splitPayment) {
      if (args.splitPayment.amountCentavos <= 0) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Split payment amount must be positive",
        });
      }
      // Split secondary method must differ from primary
      if (args.splitPayment.method === args.paymentMethod) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Split payment method must differ from primary method",
        });
      }
    }

    // 4c. A bank transfer is taken on its reference number: it is what the
    //     branch matches against the bank statement, and one transfer pays for
    //     one sale only.
    const paysByTransfer =
      args.paymentMethod === "bankTransfer" || args.splitPayment?.method === "bankTransfer";
    const paymentReference = paysByTransfer
      ? (args.paymentReference ?? "").replace(/\s+/g, "").toUpperCase()
      : undefined;
    if (paymentReference !== undefined) {
      if (paymentReference === "") {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Enter the bank transfer's reference number.",
        });
      }
      if (paymentReference.length > 64) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "That reference number is too long.",
        });
      }
      const reused = await ctx.db
        .query("transactions")
        .withIndex("by_branch_payment_reference", (q) =>
          q.eq("branchId", branchId).eq("paymentReference", paymentReference)
        )
        .filter((q) => q.neq(q.field("status"), "voided"))
        .first();
      if (reused) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: `Reference ${paymentReference} was already used on receipt ${reused.receiptNumber}.`,
        });
      }
    }

    // 5. Stock validation + authoritative price lookup (H1: NEVER trust client prices)
    const validatedItems: {
      variantId: Id<"variants">;
      quantity: number;
      unitPriceCentavos: number;
      inventoryId: Id<"inventory">;
      inventoryQuantity: number;
    }[] = [];
    const insufficientItems: {
      variantId: string;
      requested: number;
      available: number;
    }[] = [];

    for (const item of args.items) {
      // The authoritative price: what this branch sells the variant at
      const variant = await ctx.db.get(item.variantId);
      if (!variant || !variant.isActive) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Invalid or inactive product",
        });
      }

      const inventoryRecord = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", branchId).eq("variantId", item.variantId)
        )
        .unique();

      if (!inventoryRecord || inventoryRecord.quantity < item.quantity) {
        insufficientItems.push({
          variantId: item.variantId,
          requested: item.quantity,
          available: inventoryRecord?.quantity ?? 0,
        });
      } else {
        validatedItems.push({
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceCentavos: await branchPrice(ctx, branchId, variant),
          inventoryId: inventoryRecord._id,
          inventoryQuantity: inventoryRecord.quantity,
        });
      }
    }

    if (insufficientItems.length > 0) {
      throw new ConvexError({
        code: "INSUFFICIENT_STOCK",
        data: insufficientItems,
      });
    }

    // 6. Server-side tax calculation using AUTHORITATIVE prices (not client values)
    const taxBreakdown = calculateTaxBreakdown(validatedItems, args.discountType);

    // 6b. Promotions (only when discountType is "none" — promos don't stack
    //     with Senior/PWD). A sale may carry several, held in check by the
    //     shop's rules: exclusive promos stand alone, at most so many per
    //     sale, and at most so much off (convex/_helpers/promoStacking.ts).
    let promoDiscountCentavos = 0;
    let appliedPromotionId: Id<"promotions"> | undefined;
    let appliedPromotions:
      | { promotionId: Id<"promotions">; name: string; discountCentavos: number }[]
      | undefined;

    const requestedPromotionIds = [
      ...new Set([
        ...(args.promotionIds ?? []),
        ...(args.promotionId ? [args.promotionId] : []),
      ]),
    ];

    if (args.discountType === "none" && requestedPromotionIds.length > 0) {
      const now = Date.now();
      const currentBranch = await ctx.db.get(branchId);
      const promos: Doc<"promotions">[] = [];

      for (const promotionId of requestedPromotionIds) {
        const promo = await ctx.db.get(promotionId);
        if (!promo || !promo.isActive) {
          throw new ConvexError({
            code: "INVALID_PAYMENT",
            message: "Promotion not found or inactive",
          });
        }
        if (now < promo.startDate || (promo.endDate !== undefined && now > promo.endDate)) {
          throw new ConvexError({
            code: "INVALID_PAYMENT",
            message: `${promo.name} has expired or has not started`,
          });
        }
        // Branch scope: classification OR specific branch IDs
        const hasClassFilter = promo.branchClassifications && promo.branchClassifications.length > 0;
        const hasBranchIdFilter = promo.branchIds.length > 0;
        if (hasClassFilter || hasBranchIdFilter) {
          const matchesClass = hasClassFilter && currentBranch?.classification
            ? promo.branchClassifications!.includes(currentBranch.classification)
            : false;
          const matchesBranchId = hasBranchIdFilter && promo.branchIds.includes(branchId);
          if (!matchesClass && !matchesBranchId) {
            throw new ConvexError({
              code: "INVALID_PAYMENT",
              message: `${promo.name} is not valid for this branch`,
            });
          }
        }
        promos.push(promo);
      }

      // Enrich cart items with brand/category for product scope filtering
      const enrichedItems: CartItemForPromo[] = [];
      const categoryBrandCache = new Map<string, string>();

      for (const vi of validatedItems) {
        const variant = await ctx.db.get(vi.variantId);
        if (!variant) continue;
        const style = await ctx.db.get(variant.styleId);
        if (!style) continue;

        const categoryId = String(style.categoryId ?? "");
        // Resolve brandId: new path (style.brandId) or legacy (category.brandId)
        let brandId2 = style.brandId ? String(style.brandId) : categoryBrandCache.get(categoryId);
        if (!brandId2 && style.categoryId) {
          const cat = await ctx.db.get(style.categoryId);
          brandId2 = cat ? String(cat.brandId) : "";
          categoryBrandCache.set(categoryId, brandId2);
        }

        // Determine aging tier from oldest batch
        const oldestBatch = await ctx.db
          .query("inventoryBatches")
          .withIndex("by_branch_variant_received", (q) =>
            q.eq("branchId", branchId).eq("variantId", vi.variantId)
          )
          .first();

        let agingTier: "green" | "yellow" | "red" = "green";
        if (oldestBatch && oldestBatch.quantity > 0) {
          const ageDays = Math.floor((Date.now() - oldestBatch.receivedAt) / 86_400_000);
          if (ageDays > 180) agingTier = "red";
          else if (ageDays > 90) agingTier = "yellow";
        }

        enrichedItems.push({
          variantId: String(vi.variantId),
          brandId: brandId2 ?? "",
          categoryId,
          styleId: String(variant.styleId),
          gender: variant.gender ?? "",
          color: variant.color,
          sizeGroup: variant.sizeGroup ?? "",
          size: variant.size,
          unitPriceCentavos: vi.unitPriceCentavos,
          quantity: vi.quantity,
          agingTier,
        });
      }

      // The whole promotion, reward fields included — the cart preview stacks
      // the same way, so what the till shows is what the sale gives.
      const stack = stackPromos(
        enrichedItems,
        promos.map((promo) => ({
          ...toPromoInput(promo),
          id: String(promo._id),
          exclusive: promo.exclusive ?? false,
        })),
        taxBreakdown.totalCentavos,
        await readPromoRules(ctx)
      );

      promoDiscountCentavos = stack.discountCentavos;
      if (stack.applied.length > 0) {
        appliedPromotions = stack.applied.map((a) => ({
          promotionId: a.id as Id<"promotions">,
          name: a.name,
          discountCentavos: a.discountCentavos,
        }));
        // The biggest one is what a report reading a single promotion sees.
        appliedPromotionId = appliedPromotions[0].promotionId;
      }
    }

    const finalTotalCentavos = taxBreakdown.totalCentavos - promoDiscountCentavos;

    // 7. Validate cash sufficiency
    if (args.paymentMethod === "cash") {
      // For split payments, the cash portion only needs to cover its share
      const cashPortion = args.splitPayment
        ? finalTotalCentavos - args.splitPayment.amountCentavos
        : finalTotalCentavos;
      if (args.amountTenderedCentavos! < cashPortion) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Amount tendered is less than total",
        });
      }
    }

    // 7b. Validate split amounts sum to total
    if (args.splitPayment) {
      const splitSecondary = args.splitPayment.amountCentavos;
      const splitPrimary = finalTotalCentavos - splitSecondary;
      if (splitPrimary <= 0) {
        throw new ConvexError({
          code: "INVALID_PAYMENT",
          message: "Primary payment amount must be positive",
        });
      }
    }

    // 8. Issue this register's next invoice serial. The terminal is stamped on
    //    the sale so the Z-reading can report per machine, as BIR registers them.
    const receiptNumber = await nextInvoiceNumber(ctx, branchId, terminal?._id);

    // 9. Insert transaction record
    const cashPortion = args.splitPayment
      ? finalTotalCentavos - args.splitPayment.amountCentavos
      : finalTotalCentavos;
    const changeCentavos =
      args.paymentMethod === "cash"
        ? args.amountTenderedCentavos! - cashPortion
        : undefined;

    const transactionId = await ctx.db.insert("transactions", {
      branchId,
      terminalId: terminal?._id,
      cashierId: scope.userId,
      receiptNumber,
      subtotalCentavos: taxBreakdown.subtotalCentavos,
      vatAmountCentavos: taxBreakdown.vatAmountCentavos,
      discountAmountCentavos: taxBreakdown.discountAmountCentavos,
      totalCentavos: finalTotalCentavos,
      paymentMethod: args.paymentMethod,
      discountType: args.discountType,
      promotionId: appliedPromotionId,
      appliedPromotions,
      promoDiscountAmountCentavos:
        promoDiscountCentavos > 0 ? promoDiscountCentavos : undefined,
      splitPayment: args.splitPayment,
      paymentReference,
      fashionAssistantId: args.fashionAssistantId,
      amountTenderedCentavos:
        args.paymentMethod === "cash"
          ? args.amountTenderedCentavos
          : undefined,
      changeCentavos,
      customerName: args.customerName?.trim() || undefined,
      customerTin: args.customerTin?.trim() || undefined,
      customerAddress: args.customerAddress?.trim() || undefined,
      customerBusinessStyle: args.customerBusinessStyle?.trim() || undefined,
      scPwdName: args.scPwdName?.trim() || undefined,
      scPwdIdNumber: args.scPwdIdNumber?.trim() || undefined,
      isOffline: args.offlineQueuedAt !== undefined,
      createdAt: Date.now(),
    });

    // 10. Insert transaction items (using SERVER-validated prices)
    for (const vi of validatedItems) {
      await ctx.db.insert("transactionItems", {
        transactionId,
        variantId: vi.variantId,
        quantity: vi.quantity,
        unitPriceCentavos: vi.unitPriceCentavos,
        lineTotalCentavos: vi.unitPriceCentavos * vi.quantity,
      });
    }

    // 11. Decrement inventory + FIFO batch consumption
    for (const vi of validatedItems) {
      await ctx.db.patch(vi.inventoryId, {
        quantity: vi.inventoryQuantity - vi.quantity,
        updatedAt: Date.now(),
      });
      // Non-blocking: alert check runs in a separate transaction after this one commits
      await ctx.scheduler.runAfter(0, internal.inventory.alerts.checkInventoryAlert, {
        inventoryId: vi.inventoryId,
      });

      // FIFO: consume oldest batches first
      let remaining = vi.quantity;
      const batches = await ctx.db
        .query("inventoryBatches")
        .withIndex("by_branch_variant_received", (q) =>
          q.eq("branchId", branchId).eq("variantId", vi.variantId)
        )
        .collect(); // Ascending by receivedAt = oldest first

      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        if (take === batch.quantity) {
          await ctx.db.delete(batch._id);
        } else {
          await ctx.db.patch(batch._id, { quantity: batch.quantity - take });
        }
        remaining -= take;
      }
    }

    // 12. Audit log
    await _logAuditEntry(ctx, {
      action: "transaction.create",
      userId: scope.userId,
      branchId,
      entityType: "transactions",
      entityId: transactionId,
      after: {
        receiptNumber,
        totalCentavos: finalTotalCentavos,
        paymentMethod: args.paymentMethod,
        paymentReference: paymentReference ?? null,
        itemCount: args.items.length,
        promotionId: appliedPromotionId ?? null,
        promotions: appliedPromotions?.map((a) => a.name) ?? [],
        promoDiscountCentavos,
      },
    });

    // 13. Return result
    return {
      transactionId,
      receiptNumber,
      totalCentavos: finalTotalCentavos,
      changeCentavos: changeCentavos ?? 0,
      promoDiscountCentavos,
    };
  },
});

// ─── getTodayTransactions ────────────────────────────────────────────────────
// Returns today's transactions for the branch (manager/admin only).
// Used by the void management page.

const VOID_MANAGER_ROLES = ["admin", "manager"] as const;
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

export const getTodayTransactions = query({
  args: {
    cursor: v.optional(v.number()), // createdAt of last seen item (timestamp cursor)
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, VOID_MANAGER_ROLES);
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId;
    if (!branchId) return { transactions: [], hasMore: false };

    const pageSize = Math.min(args.limit ?? 50, 100);

    // Today in PHT
    const now = Date.now();
    const phtDate = new Date(now + PHT_OFFSET_MS);
    const startOfDayMs =
      Date.UTC(phtDate.getUTCFullYear(), phtDate.getUTCMonth(), phtDate.getUTCDate()) -
      PHT_OFFSET_MS;
    const endOfDayMs = startOfDayMs + 86_400_000;

    // Cursor: if provided, use as upper bound (fetch older records)
    const upperBound = args.cursor ?? endOfDayMs;

    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_branch_date", (q) =>
        q
          .eq("branchId", branchId)
          .gte("createdAt", startOfDayMs)
          .lt("createdAt", upperBound)
      )
      .order("desc")
      .take(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);

    // Filter out negative-total return transactions
    const sales = page.filter((t) => t.totalCentavos >= 0);

    // Resolve cashier names
    const userCache = new Map<string, string>();
    const enriched = await Promise.all(
      sales.map(async (txn) => {
        const uid = txn.cashierId as string;
        if (!userCache.has(uid)) {
          const u = await ctx.db.get(txn.cashierId);
          userCache.set(uid, u?.name ?? "Unknown");
        }
        return {
          _id: txn._id,
          receiptNumber: txn.receiptNumber,
          totalCentavos: txn.totalCentavos,
          paymentMethod: txn.paymentMethod,
          cashierName: userCache.get(uid) ?? "Unknown",
          status: txn.status ?? "completed",
          voidedAt: txn.voidedAt,
          voidReason: txn.voidReason,
          createdAt: txn.createdAt,
        };
      })
    );

    return {
      transactions: enriched,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].createdAt : undefined,
    };
  },
});

// ─── voidTransaction ─────────────────────────────────────────────────────────
// Voids a same-day transaction. Manager/admin only.
// Restocks inventory, marks transaction as voided, logs audit entry.

export const voidTransaction = mutation({
  args: {
    transactionId: v.id("transactions"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, VOID_MANAGER_ROLES);
    const scope = await withBranchScope(ctx);
    const branchId = scope.branchId!;

    // 1. Load transaction
    const txn = await ctx.db.get(args.transactionId);
    if (!txn) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Transaction not found." });
    }

    // 2. Branch scope
    if (txn.branchId !== branchId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    // 3. Already voided?
    if (txn.status === "voided") {
      throw new ConvexError({ code: "ALREADY_VOIDED", message: "Transaction is already voided." });
    }

    // 4. Return transactions cannot be voided
    if (txn.totalCentavos < 0) {
      throw new ConvexError({ code: "INVALID", message: "Return transactions cannot be voided." });
    }

    // 5. Same-day check (PHT)
    const nowMs = Date.now();
    const phtDate = new Date(nowMs + PHT_OFFSET_MS);
    const startOfDayMs =
      Date.UTC(phtDate.getUTCFullYear(), phtDate.getUTCMonth(), phtDate.getUTCDate()) -
      PHT_OFFSET_MS;
    if (txn.createdAt < startOfDayMs) {
      throw new ConvexError({
        code: "TOO_OLD",
        message: "Only today's transactions can be voided. Use Returns for older transactions.",
      });
    }

    // 6. Block if returns already processed against this transaction
    const existingReturn = await ctx.db
      .query("transactions")
      .withIndex("by_receiptNumber", (q) =>
        q.eq("receiptNumber", `RET-${txn.receiptNumber}`)
      )
      .first();
    if (existingReturn) {
      throw new ConvexError({
        code: "HAS_RETURNS",
        message: "This transaction has existing returns and cannot be voided.",
      });
    }

    // 7. Restock inventory for each item
    const items = await ctx.db
      .query("transactionItems")
      .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
      .collect();

    for (const item of items) {
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", branchId).eq("variantId", item.variantId)
        )
        .unique();

      if (inv) {
        await ctx.db.patch(inv._id, {
          quantity: inv.quantity + item.quantity,
          updatedAt: nowMs,
        });
      }
    }

    // 8. Mark transaction voided
    await ctx.db.patch(args.transactionId, {
      status: "voided",
      voidedAt: nowMs,
      voidedById: user._id,
      voidReason: args.reason.trim(),
    });

    // 9. Audit log
    await _logAuditEntry(ctx, {
      action: "transaction.void",
      userId: user._id,
      branchId,
      entityType: "transactions",
      entityId: args.transactionId,
      after: {
        receiptNumber: txn.receiptNumber,
        totalCentavos: txn.totalCentavos,
        reason: args.reason.trim(),
        voidedBy: user.name,
      },
    });
  },
});
