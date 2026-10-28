// convex/transfers/allocations.ts — a pre-allocated push, uploaded as a file.
//
// A seasonal allocation is decided away from this system: in a buy sheet, by
// whoever plans the push — the super admin today, a merchandising account
// later. Re-keying it as one transfer request per branch is where it gets
// mistyped, and a push of twenty branches is twenty chances to do so.
//
// So the sheet is uploaded. One row is one SKU going to one branch:
//
//     SKU,Branch Code,Quantity,Notes
//     AER-TEE-BLK-M,100-5021,10,FW25 drop 1
//     AER-TEE-BLK-M,100-5008,6,FW25 drop 1
//
// Rows are grouped by destination and become ordinary transfer requests, one
// per branch, each sitting at "requested". NOTHING MOVES ON UPLOAD. Logistics
// approves or rejects each one in the same queue as every other request, with
// the same stock holding, the same release on rejection and the same audit
// trail — an uploaded allocation is a proposal, not an instruction.
//
// A row the warehouse cannot cover is reported and left out; the rest of the
// file still goes through. The alternative — refusing the file over one short
// line — means a five-hundred-row push waits on one SKU, and the person
// re-uploads the whole thing to find the next problem.
//
// How a row is read lives in ./allocationPlan, apart from the database, so it
// can be tested directly.

import { action, internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { withBranchScope } from "../_helpers/withBranchScope";
import { HQ_ROLES } from "../_helpers/permissions";

/**
 * Who may plan a push. Merchandising decides what goes where; it does not
 * approve it — the request still lands in the transfer queue for logistics,
 * exactly as a typed one does.
 */
const PLANNING_ROLES = Array.from(new Set([...HQ_ROLES, "merchandiser"]));
import { _logAuditEntry } from "../_helpers/auditLog";
import { createTransferForRequester } from "./requests";
import { brandLabel, brandNameMap, branchCarries } from "../_helpers/branchBrands";
import {
  planAllocation,
  indexBranches,
  type AllocationLookup,
} from "./allocationPlan";

/** Enough for a full seasonal push; past this the file is a mistake. */
const MAX_ALLOCATION_ROWS = 5000;

// ─── getAllocationTemplate ────────────────────────────────────────────────────
// The format, filled in with this chain's real branch names so nobody has to
// guess the spelling the upload will match on.

export const getAllocationTemplate = query({
  args: {},
  handler: async (ctx) => {
    const scope = await withBranchScope(ctx);
    if (!PLANNING_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const branches = await ctx.db.query("branches").collect();
    const active = branches.filter((b) => b.isActive);
    const warehouse = active.find((b) => b.channel === "warehouse");

    return {
      sourceName: warehouse?.name ?? null,
      // Destinations only: the warehouse cannot allocate to itself. The code
      // is what a sheet should carry; the name is there to read it by.
      branches: active
        .filter((b) => b.channel !== "warehouse")
        .map((b) => ({ _id: b._id, code: b.code ?? null, name: b.name }))
        .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name)),
      maxRows: MAX_ALLOCATION_ROWS,
    };
  },
});

// ─── Per-branch template ──────────────────────────────────────────────────────
// One branch's sheet: every SKU the warehouse holds that the branch may carry,
// quantity left at 0 to fill in. The warehouse can run to tens of thousands of
// SKUs, past what one query may read, so it is read a page at a time.

const TEMPLATE_PAGE = 500;

type TemplateLine = {
  sku: string;
  styleCode: string | null;
  product: string;
  size: string;
  color: string;
  brand: string;
  onHand: number;
};

export const _branchTemplatePage = internalQuery({
  args: { branchId: v.id("branches"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    if (!PLANNING_ROLES.includes(scope.user.role)) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }
    const branch = await ctx.db.get(args.branchId);
    if (!branch || !branch.isActive) {
      throw new ConvexError({ code: "NOT_FOUND", message: "That branch is not active." });
    }
    const warehouse = (await ctx.db.query("branches").collect()).find(
      (b) => b.isActive && b.channel === "warehouse"
    );
    if (!warehouse) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "No active central warehouse to allocate from.",
      });
    }

    const page = await ctx.db
      .query("inventory")
      .withIndex("by_branch", (q) => q.eq("branchId", warehouse._id))
      .paginate({ cursor: args.cursor, numItems: TEMPLATE_PAGE });

    const brandNames = await brandNameMap(ctx);
    const styles = new Map<string, Doc<"styles"> | null>();
    const lines: TemplateLine[] = [];
    for (const inv of page.page) {
      if (inv.quantity <= 0) continue;
      const variant = await ctx.db.get(inv.variantId);
      if (!variant || !variant.isActive) continue;
      const styleKey = variant.styleId as string;
      if (!styles.has(styleKey)) styles.set(styleKey, await ctx.db.get(variant.styleId));
      const style = styles.get(styleKey);
      if (!style || !style.isActive || !branchCarries(branch, style.brandId)) continue;
      lines.push({
        sku: variant.sku,
        styleCode: style.styleCode ?? null,
        product: style.name,
        size: variant.size,
        color: variant.color,
        brand: style.brandId ? brandNames.get(style.brandId as string) ?? "" : "",
        onHand: inv.quantity,
      });
    }

    return {
      branch: { code: branch.code ?? null, name: branch.name, brands: brandLabel(branch, brandNames) },
      warehouseName: warehouse.name,
      lines,
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const buildBranchTemplate = action({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const lines: TemplateLine[] = [];
    let cursor: string | null = null;
    let head: { code: string | null; name: string; brands: string } | null = null;
    let warehouseName = "";
    do {
      const page: {
        branch: { code: string | null; name: string; brands: string };
        warehouseName: string;
        lines: TemplateLine[];
        cursor: string | null;
      } = await ctx.runQuery(internal.transfers.allocations._branchTemplatePage, {
        branchId: args.branchId,
        cursor,
      });
      head = page.branch;
      warehouseName = page.warehouseName;
      lines.push(...page.lines);
      cursor = page.cursor;
    } while (cursor !== null);

    lines.sort((a, b) => a.product.localeCompare(b.product) || a.sku.localeCompare(b.sku));
    return { branch: head!, warehouseName, lines };
  },
});

// ─── uploadAllocation ─────────────────────────────────────────────────────────

export const uploadAllocation = mutation({
  args: {
    fileName: v.string(),
    /** Defaults to the active warehouse, which is where a push comes from. */
    fromBranchId: v.optional(v.id("branches")),
    rows: v.array(
      v.object({
        sku: v.string(),
        branchName: v.string(),
        quantity: v.number(),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    // Allocation is a planning act, not a branch one. Branch users ask for
    // stock through the ordinary request form.
    if (!PLANNING_ROLES.includes(scope.user.role)) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Only HQ or merchandising can upload an allocation.",
      });
    }
    if (args.rows.length === 0) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "That file has no rows under its header.",
      });
    }
    if (args.rows.length > MAX_ALLOCATION_ROWS) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: `That file has ${args.rows.length} rows; the most that can be uploaded at once is ${MAX_ALLOCATION_ROWS}.`,
      });
    }

    const branches = await ctx.db.query("branches").collect();
    const active = branches.filter((b) => b.isActive);

    const source = args.fromBranchId
      ? branches.find((b) => b._id === args.fromBranchId)
      : active.find((b) => b.channel === "warehouse");
    if (!source || !source.isActive) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: args.fromBranchId
          ? "That source branch was not found, or is no longer active."
          : "No active central warehouse to allocate from.",
      });
    }

    // Matched on code, or on name for sheets that still carry one.
    const branchesByName = indexBranches(active);

    // Every distinct SKU resolved once, with what the source holds of it.
    const variantBySku = new Map<
      string,
      { key: string; sku: string; brandKey: string | null } | null
    >();
    const availableByVariant = new Map<string, number>();
    const variantById = new Map<string, Doc<"variants">>();

    for (const raw of args.rows) {
      const sku = raw.sku.trim();
      if (!sku || variantBySku.has(sku)) continue;

      const variant = await ctx.db
        .query("variants")
        .withIndex("by_sku", (q) => q.eq("sku", sku))
        .unique();
      if (!variant || !variant.isActive) {
        variantBySku.set(sku, null);
        continue;
      }

      const key = variant._id as string;
      const style = await ctx.db.get(variant.styleId);
      variantBySku.set(sku, {
        key,
        sku: variant.sku,
        brandKey: (style?.brandId as string | undefined) ?? null,
      });
      variantById.set(key, variant);

      const inventory = await ctx.db
        .query("inventory")
        .withIndex("by_branch_variant", (q) =>
          q.eq("branchId", source._id).eq("variantId", variant._id)
        )
        .unique();
      availableByVariant.set(key, inventory?.quantity ?? 0);
    }

    const lookup: AllocationLookup = {
      sourceKey: source._id as string,
      sourceName: source.name,
      branchesByName,
      variantBySku,
      availableByVariant,
      brandNames: await brandNameMap(ctx),
    };
    const plan = planAllocation(args.rows, lookup);

    // ── Create one request per destination, in sheet order ──────────────────
    const fileName = args.fileName.trim() || "allocation";
    const created: {
      transferId: Id<"transfers">;
      branchName: string;
      lines: number;
      units: number;
    }[] = [];

    for (const branch of plan.branches) {
      if (branch.lines.length === 0) continue;

      // Going through createTransferForRequester rather than writing rows here
      // is what keeps an uploaded request identical to a typed one: the same
      // direction rules, the same stock hold, the same notification.
      const noteParts = [`Allocation · ${fileName}`, ...branch.notes];
      const transferId = await createTransferForRequester(ctx, scope, {
        fromBranchId: source._id,
        toBranchId: branch.branchKey as Id<"branches">,
        type: "stockRequest",
        notes: noteParts.join(" · ").slice(0, 500),
        allocationFileName: fileName,
        items: branch.lines.map((line) => ({
          sku: line.sku,
          requestedQuantity: line.quantity,
        })),
      });

      created.push({
        transferId,
        branchName: branch.branchName,
        lines: branch.lines.length,
        units: branch.lines.reduce((sum, line) => sum + line.quantity, 0),
      });
    }

    const totalUnits = created.reduce((sum, c) => sum + c.units, 0);

    // The upload is one act even though it cuts several requests, so it gets
    // one entry. It is filed against the first request it created, or against
    // the source branch when it created none — a file that produced nothing
    // still has to be findable afterwards.
    const first = created[0];
    await _logAuditEntry(ctx, {
      action: "transfer.allocationUpload",
      userId: scope.userId,
      entityType: first ? "transfers" : "branches",
      entityId: first ? (first.transferId as string) : (source._id as string),
      after: {
        fileName,
        fromBranchId: source._id,
        rowsRead: args.rows.length,
        requestsCreated: created.length,
        unitsAllocated: totalUnits,
        rowsSkipped: plan.problems.length,
      },
    });

    return {
      fileName,
      sourceName: source.name,
      rowsRead: args.rows.length,
      created,
      totalUnits,
      problems: plan.problems,
    };
  },
});
