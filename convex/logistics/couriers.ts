// convex/logistics/couriers.ts — Managed list of third-party couriers.

import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import {
  requireRole,
  ADMIN_ROLES,
  WAREHOUSE_ROLES,
} from "../_helpers/permissions";

const PICKER_ROLES = [...WAREHOUSE_ROLES, "manager"] as const;

/** Active couriers — for the dispatch picker. */
export const listActiveCouriers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, PICKER_ROLES);
    const couriers = await ctx.db.query("couriers").withIndex("by_name").collect();
    return couriers
      .filter((c) => c.isActive)
      .map((c) => ({ _id: c._id, name: c.name }));
  },
});

/** All couriers — for admin management. */
export const listCouriers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ADMIN_ROLES);
    return await ctx.db.query("couriers").withIndex("by_name").collect();
  },
});

export const createCourier = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, ADMIN_ROLES);
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Courier name is required." });
    }
    const now = Date.now();
    return await ctx.db.insert("couriers", {
      name,
      isActive: true,
      createdById: admin._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setCourierActive = mutation({
  args: { courierId: v.id("couriers"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ROLES);
    await ctx.db.patch(args.courierId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});
