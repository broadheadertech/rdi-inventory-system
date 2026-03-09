import { query } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";

// ─── Expansion Intelligence ─────────────────────────────────────────────────
// Analyzes order delivery addresses to identify geographic demand hotspots
// for potential new branch locations.

export const getExpansionInsights = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin"]);

    // 1. Fetch all orders that have a shippingAddress
    const allOrders = await ctx.db.query("orders").collect();
    const ordersWithAddress = allOrders.filter(
      (o) => o.shippingAddress?.city && o.shippingAddress?.province
    );

    if (ordersWithAddress.length === 0) return [];

    // 2. Determine the data period for monthly extrapolation
    const timestamps = ordersWithAddress.map((o) => o._creationTime);
    const earliestMs = Math.min(...timestamps);
    const latestMs = Math.max(...timestamps);
    const spanMonths = Math.max(
      (latestMs - earliestMs) / (1000 * 60 * 60 * 24 * 30),
      1
    );

    // 3. Group by city + province
    const areaMap = new Map<
      string,
      {
        city: string;
        province: string;
        totalRevenueCentavos: number;
        orderCount: number;
        customerIds: Set<string>;
      }
    >();

    for (const order of ordersWithAddress) {
      const city = order.shippingAddress!.city;
      const province = order.shippingAddress!.province;
      const key = `${city.toLowerCase()}|${province.toLowerCase()}`;

      let area = areaMap.get(key);
      if (!area) {
        area = {
          city,
          province,
          totalRevenueCentavos: 0,
          orderCount: 0,
          customerIds: new Set<string>(),
        };
        areaMap.set(key, area);
      }

      area.orderCount += 1;
      area.totalRevenueCentavos += order.totalCentavos;
      area.customerIds.add(String(order.customerId));
    }

    // 4. Load branches for existing-branch check
    const branches = await ctx.db.query("branches").collect();
    const branchCities = branches.map((b) => b.address.toLowerCase());

    // 5. Build results, filter, sort
    const results: Array<{
      city: string;
      province: string;
      orderCount: number;
      totalRevenueCentavos: number;
      avgOrderValueCentavos: number;
      uniqueCustomers: number;
      hasBranch: boolean;
      estimatedMonthlyRevenueCentavos: number;
    }> = [];

    for (const area of areaMap.values()) {
      const hasBranch = branchCities.some(
        (addr) =>
          addr.includes(area.city.toLowerCase()) ||
          addr.includes(area.province.toLowerCase())
      );

      // Only include areas with no branch and at least 3 orders
      if (hasBranch || area.orderCount < 3) continue;

      results.push({
        city: area.city,
        province: area.province,
        orderCount: area.orderCount,
        totalRevenueCentavos: area.totalRevenueCentavos,
        avgOrderValueCentavos: Math.round(
          area.totalRevenueCentavos / area.orderCount
        ),
        uniqueCustomers: area.customerIds.size,
        hasBranch,
        estimatedMonthlyRevenueCentavos: Math.round(
          area.totalRevenueCentavos / spanMonths
        ),
      });
    }

    // Sort by revenue descending, return top 20
    results.sort((a, b) => b.totalRevenueCentavos - a.totalRevenueCentavos);
    return results.slice(0, 20);
  },
});
