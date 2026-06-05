// convex/suppliers/directory.ts — Warehouse supplier directory (name + address).
//
//   - listSuppliers: all active suppliers, ordered by name
//   - createSupplier: add a supplier (name + address)

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole, WAREHOUSE_ROLES } from "../_helpers/permissions";

/** Returns active suppliers ordered by name. */
export const listSuppliers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, WAREHOUSE_ROLES);

    const suppliers = await ctx.db
      .query("suppliers")
      .withIndex("by_name")
      .collect();

    return suppliers
      .filter((s) => s.isActive)
      .map((s) => ({
        _id: s._id,
        name: s.name,
        address: s.address,
        createdAt: s.createdAt,
      }));
  },
});

/** Creates a supplier with a name and address. */
export const createSupplier = mutation({
  args: {
    name: v.string(),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, WAREHOUSE_ROLES);

    const name = args.name.trim();
    const address = args.address.trim();
    if (!name) throw new Error("Supplier name is required.");
    if (!address) throw new Error("Supplier address is required.");

    const now = Date.now();
    return await ctx.db.insert("suppliers", {
      name,
      address,
      isActive: true,
      createdById: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});
