import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireRole, HQ_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

// ─── Queries ────────────────────────────────────────────────────────────────

export const listAnnouncements = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, HQ_ROLES);
    const all = await ctx.db.query("announcements").collect();
    return all.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Public — used by storefront AnnouncementBar */
export const getActiveAnnouncements = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db
      .query("announcements")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return all
      .filter(
        (a) =>
          (!a.startDate || a.startDate <= now) &&
          (!a.endDate || a.endDate >= now)
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => ({ _id: a._id, message: a.message }));
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createAnnouncement = mutation({
  args: {
    message: v.string(),
    sortOrder: v.number(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const id = await ctx.db.insert("announcements", {
      message: args.message,
      sortOrder: args.sortOrder,
      isActive: true,
      startDate: args.startDate,
      endDate: args.endDate,
      createdAt: Date.now(),
    });

    await _logAuditEntry(ctx, {
      action: "announcement.create",
      userId: user._id,
      entityType: "announcements",
      entityId: id,
      after: { message: args.message },
    });

    return id;
  },
});

export const updateAnnouncement = mutation({
  args: {
    announcementId: v.id("announcements"),
    message: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.announcementId);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Announcement not found" });

    const { announcementId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }

    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(announcementId, patch);

    await _logAuditEntry(ctx, {
      action: "announcement.update",
      userId: user._id,
      entityType: "announcements",
      entityId: announcementId,
      after: patch,
    });
  },
});

export const toggleAnnouncementStatus = mutation({
  args: {
    announcementId: v.id("announcements"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.announcementId);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Announcement not found" });

    await ctx.db.patch(args.announcementId, { isActive: args.isActive });

    await _logAuditEntry(ctx, {
      action: args.isActive ? "announcement.activate" : "announcement.deactivate",
      userId: user._id,
      entityType: "announcements",
      entityId: args.announcementId,
    });
  },
});

export const deleteAnnouncement = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, HQ_ROLES);

    const existing = await ctx.db.get(args.announcementId);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Announcement not found" });

    await ctx.db.delete(args.announcementId);

    await _logAuditEntry(ctx, {
      action: "announcement.delete",
      userId: user._id,
      entityType: "announcements",
      entityId: args.announcementId,
      before: { message: existing.message },
    });
  },
});
