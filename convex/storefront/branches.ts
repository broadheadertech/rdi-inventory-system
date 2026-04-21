import { query } from "../_generated/server";

/**
 * Public query — returns active retail branches for the store-pickup selector.
 * Warehouse branches are excluded (they are internal-only).
 */
export const getRetailBranches = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("branches").collect();
    return all
      .filter((b) => b.isActive && b.channel !== "warehouse")
      .map((b) => ({
        _id: b._id,
        name: b.name,
        address: b.address,
        phone: b.phone ?? null,
        latitude: b.latitude ?? null,
        longitude: b.longitude ?? null,
        businessHours: b.configuration?.businessHours ?? null,
      }));
  },
});
