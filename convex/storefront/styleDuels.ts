import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

// ─── Style Duel of the Week ──────────────────────────────────────────────────
// Two products face off — customers vote on which one they prefer.
// The duel changes weekly based on a deterministic seed.

/** Simple seeded PRNG (mulberry32) for deterministic style selection */
function seededRandom(seed: number) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function getWeekNumber(): number {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
}

// ─── Get Current Duel ────────────────────────────────────────────────────────
// Picks two random active styles with product images, deterministic per week.

export const getCurrentDuel = query({
  args: {},
  handler: async (ctx) => {
    const weekNumber = getWeekNumber();
    const weekId = `week-${weekNumber}`;

    // 1. Get all active styles
    const allStyles = await ctx.db.query("styles").collect();
    const activeStyles = allStyles.filter((s) => s.isActive);

    if (activeStyles.length < 2) return null;

    // 2. Filter to styles that have at least one product image
    const stylesWithImages: typeof activeStyles = [];
    for (const style of activeStyles) {
      const images = await ctx.db
        .query("productImages")
        .withIndex("by_style", (q) => q.eq("styleId", style._id))
        .first();
      if (images) {
        stylesWithImages.push(style);
      }
      // Stop early once we have enough candidates
      if (stylesWithImages.length >= 50) break;
    }

    if (stylesWithImages.length < 2) return null;

    // 3. Use deterministic seed to pick two styles
    const rand1 = seededRandom(weekNumber);
    const indexA = Math.floor(rand1 * stylesWithImages.length);
    let indexB = Math.floor(seededRandom(weekNumber + 9999) * (stylesWithImages.length - 1));
    if (indexB >= indexA) indexB += 1; // ensure different from A

    const styleA = stylesWithImages[indexA];
    const styleB = stylesWithImages[indexB];

    // 4. Enrich both styles with image + brand info
    async function enrichStyle(style: typeof activeStyles[number]) {
      const images = await ctx.db
        .query("productImages")
        .withIndex("by_style", (q) => q.eq("styleId", style._id))
        .collect();
      const primary = images.find((img) => img.isPrimary) ?? images[0];
      const imageUrl = primary
        ? await ctx.storage.getUrl(primary.storageId)
        : null;

      const category = await ctx.db.get(style.categoryId);
      const brand = category ? await ctx.db.get(category.brandId) : null;

      return {
        _id: style._id,
        name: style.name,
        brandName: brand?.name ?? "Unknown",
        imageUrl,
        basePriceCentavos: style.basePriceCentavos,
      };
    }

    const [enrichedA, enrichedB] = await Promise.all([
      enrichStyle(styleA),
      enrichStyle(styleB),
    ]);

    return {
      styleA: enrichedA,
      styleB: enrichedB,
      weekId,
    };
  },
});

// ─── Vote in a Duel ─────────────────────────────────────────────────────────
// Authenticated customers only. One vote per week.

export const voteDuel = mutation({
  args: {
    weekId: v.string(),
    styleId: v.id("styles"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be logged in to vote.");

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!customer) throw new Error("Customer account not found.");

    // Check if customer already voted this week
    // We look for any productVotes from this customer in the current week range
    const currentWeekNumber = getWeekNumber();
    const currentWeekId = `week-${currentWeekNumber}`;

    if (args.weekId !== currentWeekId) {
      throw new Error("This duel has expired.");
    }

    // Week boundaries in ms
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekStart = currentWeekNumber * weekMs;
    const weekEnd = weekStart + weekMs;

    // Check for existing vote in this time window
    const customerVotes = await ctx.db
      .query("productVotes")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const alreadyVotedThisWeek = customerVotes.some(
      (v) => v.votedAt >= weekStart && v.votedAt < weekEnd
    );

    if (alreadyVotedThisWeek) {
      throw new Error("You have already voted in this week's duel.");
    }

    // Insert vote
    await ctx.db.insert("productVotes", {
      styleId: args.styleId,
      customerId: customer._id,
      votedAt: Date.now(),
    });
  },
});

// ─── Get Duel Results ────────────────────────────────────────────────────────
// Returns vote counts for the two dueling styles.

export const getDuelResults = query({
  args: {
    styleAId: v.id("styles"),
    styleBId: v.id("styles"),
  },
  handler: async (ctx, args) => {
    const votesA = await ctx.db
      .query("productVotes")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleAId))
      .collect();

    const votesB = await ctx.db
      .query("productVotes")
      .withIndex("by_style", (q) => q.eq("styleId", args.styleBId))
      .collect();

    const styleAVotes = votesA.length;
    const styleBVotes = votesB.length;

    return {
      styleAVotes,
      styleBVotes,
      totalVotes: styleAVotes + styleBVotes,
    };
  },
});
