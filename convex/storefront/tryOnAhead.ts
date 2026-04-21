import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Try-On Ahead ────────────────────────────────────────────────────────────
// Customers reserve multiple items online to try on at a specific branch.
// Staff pulls them and has them ready in the fitting room.

const MAX_TRY_ON_ITEMS = 5;
const TRY_ON_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

function generateTryOnCode(): string {
  return "TRY-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ─── Create Try-On Reservation ───────────────────────────────────────────────

export const createTryOnReservation = mutation({
  args: {
    branchId: v.id("branches"),
    items: v.array(
      v.object({
        variantId: v.id("variants"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Authenticate customer
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Please sign in to reserve items for try-on." });
    }

    const customer = await ctx.db
      .query("customers")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!customer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Customer account not found." });
    }

    // Validate item count
    if (args.items.length === 0) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Please select at least one item to try on." });
    }
    if (args.items.length > MAX_TRY_ON_ITEMS) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `You can reserve up to ${MAX_TRY_ON_ITEMS} items per try-on session.`,
      });
    }

    // Verify branch exists, is active, and is retail
    const branch = await ctx.db.get(args.branchId);
    if (!branch || !branch.isActive) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Branch not found." });
    }
    if (branch.channel === "warehouse") {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Try-on is only available at retail branches." });
    }

    // Generate unique confirmation code
    let confirmationCode = generateTryOnCode();
    let existing = await ctx.db
      .query("reservations")
      .withIndex("by_confirmation", (q) => q.eq("confirmationCode", confirmationCode))
      .unique();
    let attempts = 0;
    while (existing && attempts < 10) {
      confirmationCode = generateTryOnCode();
      existing = await ctx.db
        .query("reservations")
        .withIndex("by_confirmation", (q) => q.eq("confirmationCode", confirmationCode))
        .unique();
      attempts++;
    }

    const now = Date.now();
    const expiresAt = now + TRY_ON_EXPIRY_MS;

    // Validate stock and create reservations for each item
    for (const item of args.items) {
      const variant = await ctx.db.get(item.variantId);
      if (!variant || !variant.isActive) {
        throw new ConvexError({ code: "NOT_FOUND", message: "One of the selected variants is no longer available." });
      }

      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", args.branchId).eq("variantId", item.variantId)
        )
        .unique();

      if (!inv || inv.quantity < item.quantity) {
        const style = await ctx.db.get(variant.styleId);
        throw new ConvexError({
          code: "OUT_OF_STOCK",
          message: `${style?.name ?? "Item"} (${variant.size}/${variant.color}) is out of stock at ${branch.name}.`,
        });
      }

      // Decrement inventory
      await ctx.db.patch(inv._id, {
        quantity: inv.quantity - item.quantity,
        updatedAt: now,
      });

      // Create reservation record
      await ctx.db.insert("reservations", {
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        customerPhone: customer.phone ?? "",
        customerId: customer._id,
        reservationType: "try_on",
        variantId: item.variantId,
        branchId: args.branchId,
        quantity: item.quantity,
        status: "pending",
        confirmationCode,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      confirmationCode,
      itemCount: args.items.length,
      expiresAt,
      branchName: branch.name,
    };
  },
});

// ─── Get My Try-On Reservations ──────────────────────────────────────────────

export const getMyTryOnReservations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const customer = await ctx.db
      .query("customers")
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .first();
    if (!customer) return [];

    // Get recent try-on reservations for this customer
    const reservations = await ctx.db
      .query("reservations")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .order("desc")
      .collect();

    const tryOnReservations = reservations.filter(
      (r) => r.reservationType === "try_on"
    );

    // Group by confirmationCode
    const grouped = new Map<
      string,
      {
        confirmationCode: string;
        branchId: string;
        branchName: string;
        status: string;
        expiresAt: number;
        createdAt: number;
        items: {
          variantId: string;
          styleName: string;
          size: string;
          color: string;
          priceCentavos: number;
          imageUrl: string | null;
          quantity: number;
        }[];
      }
    >();

    for (const r of tryOnReservations) {
      const variant = await ctx.db.get(r.variantId);
      const style = variant ? await ctx.db.get(variant.styleId) : null;

      // Get primary image
      let imageUrl: string | null = null;
      if (style) {
        const primaryImage = await ctx.db
          .query("productImages")
          .withIndex("by_style", (q) => q.eq("styleId", style._id))
          .first();
        if (primaryImage) {
          imageUrl = await ctx.storage.getUrl(primaryImage.storageId);
        }
      }

      const key = r.confirmationCode;
      if (!grouped.has(key)) {
        const branch = await ctx.db.get(r.branchId);
        grouped.set(key, {
          confirmationCode: r.confirmationCode,
          branchId: r.branchId as string,
          branchName: branch?.name ?? "Unknown",
          status: r.status,
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
          items: [],
        });
      }

      grouped.get(key)!.items.push({
        variantId: r.variantId as string,
        styleName: style?.name ?? "Unknown",
        size: variant?.size ?? "",
        color: variant?.color ?? "",
        priceCentavos: variant?.priceCentavos ?? 0,
        imageUrl,
        quantity: r.quantity,
      });
    }

    // Return as array, most recent first (already ordered desc)
    return Array.from(grouped.values()).slice(0, 20);
  },
});
