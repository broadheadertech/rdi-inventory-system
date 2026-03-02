import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Helpers ────────────────────────────────────────────────────────────────

const CONFIRMATION_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1

function generateConfirmationCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CONFIRMATION_CHARS[Math.floor(Math.random() * CONFIRMATION_CHARS.length)];
  }
  return `RBX-${code}`;
}

function validatePhoneNumber(phone: string): boolean {
  const stripped = phone.replace(/[\s\-()]/g, "");
  return /^(\+?63|0)9\d{9}$/.test(stripped);
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, "");
}

// ─── Public Mutation: Create Reservation (No Auth) ──────────────────────────

export const createReservationPublic = mutation({
  args: {
    variantId: v.id("variants"),
    branchId: v.id("branches"),
    customerName: v.string(),
    customerPhone: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate inputs
    const name = args.customerName.trim();
    if (!name) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Customer name is required",
      });
    }

    const phone = normalizePhone(args.customerPhone);
    if (!validatePhoneNumber(phone)) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Please enter a valid Philippine phone number (e.g., 09XX XXX XXXX)",
      });
    }

    // Verify variant exists and is active
    const variant = await ctx.db.get(args.variantId);
    if (!variant || !variant.isActive) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Product variant not found",
      });
    }

    // Verify branch exists and is active
    const branch = await ctx.db.get(args.branchId);
    if (!branch || !branch.isActive) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Branch not found",
      });
    }

    // Real-time stock check
    const inv = await ctx.db
      .query("inventory")
      .withIndex("by_branch_variant", (q) =>
        q.eq("branchId", args.branchId).eq("variantId", args.variantId)
      )
      .unique();

    if (!inv || inv.quantity <= 0) {
      // Fetch alternative branches with stock
      const allInventory = await ctx.db
        .query("inventory")
        .withIndex("by_variant", (q) => q.eq("variantId", args.variantId))
        .collect();

      const alternatives: { branchId: string; branchName: string; quantity: number }[] = [];
      for (const item of allInventory) {
        if (item.quantity > 0 && item.branchId !== args.branchId) {
          const altBranch = await ctx.db.get(item.branchId);
          if (altBranch && altBranch.isActive) {
            alternatives.push({
              branchId: item.branchId,
              branchName: altBranch.name,
              quantity: item.quantity,
            });
          }
        }
      }

      throw new ConvexError({
        code: "OUT_OF_STOCK",
        message: `Item is no longer available at ${branch.name}`,
        alternatives,
      });
    }

    // Decrement inventory
    await ctx.db.patch(inv._id, {
      quantity: inv.quantity - 1,
      updatedAt: Date.now(),
    });

    // Generate unique confirmation code
    let confirmationCode = generateConfirmationCode();
    let existing = await ctx.db
      .query("reservations")
      .withIndex("by_confirmation", (q) => q.eq("confirmationCode", confirmationCode))
      .unique();
    let attempts = 0;
    while (existing && attempts < 10) {
      confirmationCode = generateConfirmationCode();
      existing = await ctx.db
        .query("reservations")
        .withIndex("by_confirmation", (q) => q.eq("confirmationCode", confirmationCode))
        .unique();
      attempts++;
    }

    // Create reservation
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    const reservationId = await ctx.db.insert("reservations", {
      customerName: name,
      customerPhone: phone,
      variantId: args.variantId,
      branchId: args.branchId,
      quantity: 1,
      status: "pending",
      confirmationCode,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // Fetch variant details for response
    const style = await ctx.db.get(variant.styleId);

    return {
      reservationId,
      confirmationCode,
      expiresAt,
      branchName: branch.name,
      branchAddress: branch.address,
      variantDetails: {
        styleName: style?.name ?? "Unknown",
        size: variant.size,
        color: variant.color,
        priceCentavos: variant.priceCentavos,
      },
    };
  },
});

// ─── Public Query: Get Reservation by Confirmation Code ─────────────────────

export const getReservationByConfirmation = query({
  args: { confirmationCode: v.string() },
  handler: async (ctx, args) => {
    const reservation = await ctx.db
      .query("reservations")
      .withIndex("by_confirmation", (q) =>
        q.eq("confirmationCode", args.confirmationCode)
      )
      .unique();

    if (!reservation) return null;

    // Fetch related data
    const variant = await ctx.db.get(reservation.variantId);
    const branch = await ctx.db.get(reservation.branchId);
    const style = variant ? await ctx.db.get(variant.styleId) : null;

    return {
      _id: reservation._id,
      confirmationCode: reservation.confirmationCode,
      customerName: reservation.customerName,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
      branchName: branch?.name ?? "Unknown",
      branchAddress: branch?.address ?? "",
      styleName: style?.name ?? "Unknown",
      size: variant?.size ?? "",
      color: variant?.color ?? "",
      priceCentavos: variant?.priceCentavos ?? 0,
    };
  },
});
