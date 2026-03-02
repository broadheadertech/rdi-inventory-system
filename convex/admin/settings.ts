import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole, ADMIN_ROLES } from "../_helpers/permissions";
import { _logAuditEntry } from "../_helpers/auditLog";

/**
 * Public query — reads brand configuration settings.
 * No auth required so the customer-facing site can display brand tokens.
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").collect();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  },
});

/**
 * Public query — resolves site asset storage IDs to URLs.
 * Returns logo and favicon URLs for use in layouts and metadata.
 */
const ASSET_KEYS = ["siteLogoStorageId", "siteFaviconStorageId"] as const;

export const getSiteAssets = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").collect();
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const result: Record<string, string | null> = {};
    for (const key of ASSET_KEYS) {
      const storageId = settingsMap.get(key);
      if (storageId) {
        const url = await ctx.storage.getUrl(storageId as Id<"_storage">);
        result[key.replace("StorageId", "Url")] = url;
      } else {
        result[key.replace("StorageId", "Url")] = null;
      }
    }
    return result;
  },
});

/**
 * Admin-only mutation — saves a site asset (logo/favicon) storage ID.
 * Deletes the previous file from storage if replacing.
 */
export const saveSiteAsset = mutation({
  args: {
    key: v.union(v.literal("siteLogoStorageId"), v.literal("siteFaviconStorageId")),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    // Delete previous file from storage
    if (existing?.value) {
      try {
        await ctx.storage.delete(existing.value as Id<"_storage">);
      } catch {
        // Old file may already be deleted — ignore
      }
    }

    const oldValue = existing?.value;
    const newValue = args.storageId as string;

    if (existing) {
      await ctx.db.patch(existing._id, { value: newValue, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", { key: args.key, value: newValue, updatedAt: Date.now() });
    }

    await _logAuditEntry(ctx, {
      action: "setting.update",
      userId: user._id,
      entityType: "settings",
      entityId: args.key,
      before: oldValue ? { key: args.key, value: oldValue } : undefined,
      after: { key: args.key, value: newValue },
    });
  },
});

/**
 * Admin-only mutation — removes a site asset.
 */
export const deleteSiteAsset = mutation({
  args: {
    key: v.union(v.literal("siteLogoStorageId"), v.literal("siteFaviconStorageId")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (!existing) return;

    // Delete file from storage
    if (existing.value) {
      try {
        await ctx.storage.delete(existing.value as Id<"_storage">);
      } catch {
        // Ignore — file may already be gone
      }
    }

    await ctx.db.delete(existing._id);

    await _logAuditEntry(ctx, {
      action: "setting.update",
      userId: user._id,
      entityType: "settings",
      entityId: args.key,
      before: { key: args.key, value: existing.value },
      after: { key: args.key, value: "(deleted)" },
    });
  },
});

/**
 * Admin-only mutation — upserts a setting by key.
 */
export const updateSetting = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ADMIN_ROLES);

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    const oldValue = existing?.value;

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("settings", {
        key: args.key,
        value: args.value,
        updatedAt: Date.now(),
      });
    }

    await _logAuditEntry(ctx, {
      action: "setting.update",
      userId: user._id,
      entityType: "settings",
      entityId: args.key,
      before: oldValue !== undefined ? { key: args.key, value: oldValue } : undefined,
      after: { key: args.key, value: args.value },
    });
  },
});
