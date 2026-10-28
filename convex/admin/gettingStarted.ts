// convex/admin/gettingStarted.ts — the Getting Started checklist.
//
// Each step reads whether it is done from the data itself rather than from a
// box someone ticked, so the checklist cannot claim a setup that isn't there.
// Kept to small reads (take / first): it renders on a page people open often.

import { query } from "../_generated/server";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";

export const getSetupStatus = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireRole(ctx, ADMIN_ROLES);

    const branches = (await ctx.db.query("branches").collect()).filter((b) => b.isActive);
    const warehouse = branches.find((b) => b.channel === "warehouse") ?? null;
    const stores = branches.filter(
      (b) => b.channel !== "warehouse" && b.branchType !== "headOffice"
    );

    const catalogStyle = await ctx.db.query("styles").first();
    const otherUser = (await ctx.db.query("users").take(2)).some((u) => u._id !== me._id);

    // A sample is enough to say "stock has been loaded"; scanning a warehouse
    // of zero rows to prove a negative is not worth the reads.
    const warehouseHasStock = warehouse
      ? (
          await ctx.db
            .query("inventory")
            .withIndex("by_branch", (q) => q.eq("branchId", warehouse._id))
            .take(500)
        ).some((inv) => inv.quantity > 0)
      : false;

    const transfer = await ctx.db.query("transfers").first();
    const delivered = await ctx.db
      .query("transfers")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .first();

    return {
      branches: {
        count: branches.length,
        withoutCode: branches.filter((b) => !b.code).length,
        storesWithoutBrand: stores.filter((b) => !b.brandIds?.length).length,
      },
      warehouseName: warehouse?.name ?? null,
      hasCatalog: catalogStyle !== null,
      hasTeam: otherUser,
      warehouseHasStock,
      hasTransfer: transfer !== null,
      hasDelivery: delivered !== null,
    };
  },
});
