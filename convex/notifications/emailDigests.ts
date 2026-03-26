"use node";
// convex/notifications/emailDigests.ts
// Daily/weekly email digest actions — sends summary emails via Resend.
// Each action gathers data via helper queries and sends a formatted HTML email.

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Resend } from "resend";

// Cast to any — generated types may not include this module until next `npx convex dev`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal = internal as any;

// ─── Types for helper query return shapes ────────────────────────────────────

type LowStockItem = { sku: string; styleName: string; size: string; color: string; quantity: number; threshold: number };
type LowStockBranch = { branchId: string; branchName: string; alertCount: number; items: LowStockItem[] };
type LowStockData = { totalAlerts: number; branchCount: number; branches: LowStockBranch[] } | null;

type RestockItem = { branchName: string; sku: string; styleName: string; size: string; color: string; suggestedQuantity: number; currentStock: number; daysUntilStockout: number; confidence: string; rationale: string };
type RestockData = { totalSuggestions: number; highConfidence: number; mediumConfidence: number; lowConfidence: number; items: RestockItem[] } | null;

type DemandBrand = { brand: string; requestCount: number; topDesigns: { design: string; count: number }[]; topSizes: { size: string; count: number }[]; branchBreakdown: { branchName: string; count: number }[] };
type DemandData = { weekLabel: string; totalRequests: number; totalBrands: number; topBrands: DemandBrand[] } | null;

type BranchScore = { branchName: string; compositeScore: number; salesVolumeScore: number; stockAccuracyScore: number; fulfillmentSpeedScore: number; activeAlertCount: number; avgTransferHours: number };
type BranchScoresData = { period: string; branchCount: number; averageScore: number; underperformingCount: number; scores: BranchScore[] } | null;

type Recipient = { name: string; email: string };

// ─── Shared helpers ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return {
    resend: new Resend(apiKey),
    from: process.env.RESEND_FROM_EMAIL ?? "RedBox <onboarding@resend.dev>",
  };
}

// ─── 1. Low Stock Daily Digest ───────────────────────────────────────────────
// Fires daily at 7 AM PHT. Summarizes all active low-stock alerts.

export const sendLowStockDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const config = getResendConfig();
    if (!config) {
      console.warn("[lowStockDigest] RESEND_API_KEY not set — skipping");
      return;
    }

    const data: LowStockData = await ctx.runQuery(
      _internal.notifications.emailDigestHelpers._getLowStockDigestData,
      {}
    );
    if (!data || data.totalAlerts === 0) {
      console.log("[lowStockDigest] No active alerts — skipping email");
      return;
    }

    const recipients: Recipient[] = await ctx.runQuery(
      _internal.notifications.emailDigestHelpers._getManagementRecipients,
      {}
    );
    const emails = recipients.map((r: Recipient) => r.email).filter(Boolean);
    if (emails.length === 0) return;

    const today = new Date().toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "long",
    });

    // Build branch sections
    const branchSections = data.branches
      .map((branch) => {
        const itemRows = branch.items
          .map(
            (item) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escapeHtml(item.sku)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escapeHtml(item.styleName)} ${escapeHtml(item.size)} ${escapeHtml(item.color)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;">
              <span style="color:${item.quantity === 0 ? "#dc2626" : "#d97706"};font-weight:600;">${item.quantity}</span>
              <span style="color:#9ca3af;">/ ${item.threshold}</span>
            </td>
          </tr>`
          )
          .join("");

        return `
        <div style="margin-bottom:20px;">
          <div style="background:#f9fafb;padding:10px 16px;border-radius:6px 6px 0 0;border:1px solid #e5e7eb;border-bottom:none;">
            <strong style="font-size:14px;color:#111827;">${escapeHtml(branch.branchName)}</strong>
            <span style="margin-left:8px;font-size:12px;color:#6b7280;">${branch.alertCount} alert${branch.alertCount > 1 ? "s" : ""}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:0 0 6px 6px;">
            <tr style="background:#f9fafb;">
              <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">SKU</th>
              <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Product</th>
              <th style="padding:6px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Qty / Threshold</th>
            </tr>
            ${itemRows}
          </table>
        </div>`;
      })
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#fff;">
        <div style="background:#dc2626;padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:12px;color:#fca5a5;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Daily Low Stock Alert</p>
          <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">${data.totalAlerts} Items Below Threshold</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 6px;font-size:14px;color:#374151;">
            <strong>${data.totalAlerts}</strong> item${data.totalAlerts > 1 ? "s" : ""} across
            <strong>${data.branchCount}</strong> branch${data.branchCount > 1 ? "es" : ""} are running low as of ${today}.
          </p>
          <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
            Review and create transfer requests or restock orders to avoid stockouts.
          </p>
          ${branchSections}
        </div>
        <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Redbox Apparel &middot; Daily low-stock digest &middot; Sent to admin, manager &amp; HQ staff
          </p>
        </div>
      </div>`;

    try {
      await config.resend.emails.send({
        from: config.from,
        to: emails,
        subject: `[RedBox] Low Stock Alert — ${data.totalAlerts} items across ${data.branchCount} branches`,
        html,
      });
      console.log(`[lowStockDigest] Sent to ${emails.length} recipients`);
    } catch (err) {
      console.error("[lowStockDigest] Email failed:", err);
    }
  },
});

// ─── 2. Restock Suggestions Daily Digest ─────────────────────────────────────
// Fires daily at 5:30 AM PHT (after restock generation at 5 AM).

export const sendRestockDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const config = getResendConfig();
    if (!config) {
      console.warn("[restockDigest] RESEND_API_KEY not set — skipping");
      return;
    }

    const data: RestockData = await ctx.runQuery(
      _internal.notifications.emailDigestHelpers._getRestockDigestData,
      {}
    );
    if (!data || data.totalSuggestions === 0) {
      console.log("[restockDigest] No active suggestions — skipping email");
      return;
    }

    const recipients: Recipient[] = await ctx.runQuery(
      _internal.notifications.emailDigestHelpers._getManagementRecipients,
      {}
    );
    const emails = recipients.map((r: Recipient) => r.email).filter(Boolean);
    if (emails.length === 0) return;

    const confidenceBadge = (c: string) => {
      const colors: Record<string, { bg: string; text: string }> = {
        high: { bg: "#fee2e2", text: "#991b1b" },
        medium: { bg: "#fef3c7", text: "#92400e" },
        low: { bg: "#dbeafe", text: "#1e40af" },
      };
      const col = colors[c] ?? colors.low;
      return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${col.bg};color:${col.text};text-transform:capitalize;">${c}</span>`;
    };

    const itemRows = data.items
      .map(
        (item) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escapeHtml(item.branchName)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escapeHtml(item.sku)} — ${escapeHtml(item.styleName)} ${escapeHtml(item.size)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;">${item.currentStock}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;color:${item.daysUntilStockout <= 3 ? "#dc2626" : "#d97706"};font-weight:600;">${item.daysUntilStockout}d</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;">${confidenceBadge(item.confidence)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;font-weight:600;">+${item.suggestedQuantity}</td>
        </tr>`
      )
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#fff;">
        <div style="background:#9333ea;padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:12px;color:#d8b4fe;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Daily Restock Suggestions</p>
          <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">${data.totalSuggestions} Items Need Restocking</h1>
        </div>
        <div style="padding:24px;">
          <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
            <div style="background:#fee2e2;border-radius:8px;padding:12px 16px;flex:1;min-width:100px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#991b1b;">${data.highConfidence}</div>
              <div style="font-size:11px;color:#991b1b;text-transform:uppercase;">High Urgency</div>
            </div>
            <div style="background:#fef3c7;border-radius:8px;padding:12px 16px;flex:1;min-width:100px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#92400e;">${data.mediumConfidence}</div>
              <div style="font-size:11px;color:#92400e;text-transform:uppercase;">Medium</div>
            </div>
            <div style="background:#dbeafe;border-radius:8px;padding:12px 16px;flex:1;min-width:100px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#1e40af;">${data.lowConfidence}</div>
              <div style="font-size:11px;color:#1e40af;text-transform:uppercase;">Low</div>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;">
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Branch</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Product</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Stock</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Days Left</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Urgency</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Restock</th>
            </tr>
            ${itemRows}
          </table>

          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
            Log in to the admin dashboard to accept or dismiss these suggestions.
          </p>
        </div>
        <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Redbox Apparel &middot; Daily restock digest &middot; Sent to admin, manager &amp; HQ staff
          </p>
        </div>
      </div>`;

    try {
      await config.resend.emails.send({
        from: config.from,
        to: emails,
        subject: `[RedBox] Restock Alert — ${data.totalSuggestions} items (${data.highConfidence} urgent)`,
        html,
      });
      console.log(`[restockDigest] Sent to ${emails.length} recipients`);
    } catch (err) {
      console.error("[restockDigest] Email failed:", err);
    }
  },
});

// ─── 3. Demand Weekly Summary Email ──────────────────────────────────────────
// Fires weekly on Monday at 6:30 AM PHT (after generation at 6 AM).

export const sendDemandDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const config = getResendConfig();
    if (!config) {
      console.warn("[demandDigest] RESEND_API_KEY not set — skipping");
      return;
    }

    const data: DemandData = await ctx.runQuery(
      _internal.notifications.emailDigestHelpers._getDemandDigestData,
      {}
    );
    if (!data) {
      console.log("[demandDigest] No demand data — skipping email");
      return;
    }

    const recipients: Recipient[] = await ctx.runQuery(
      _internal.notifications.emailDigestHelpers._getManagementRecipients,
      {}
    );
    const emails = recipients.map((r: Recipient) => r.email).filter(Boolean);
    if (emails.length === 0) return;

    const brandRows = data.topBrands
      .map((brand, i) => {
        const designList = brand.topDesigns
          .map((d) => `${escapeHtml(d.design)} (${d.count})`)
          .join(", ");
        const sizeList = brand.topSizes
          .map((s) => `${escapeHtml(s.size)} (${s.count})`)
          .join(", ");
        const branchList = brand.branchBreakdown
          .map((b) => `${escapeHtml(b.branchName)}: ${b.count}`)
          .join(", ");

        return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:#111827;">${i + 1}. ${escapeHtml(brand.brand)}</td>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;font-weight:700;color:#7c3aed;">${brand.requestCount}</td>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${designList || "—"}</td>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${sizeList || "—"}</td>
        </tr>
        ${branchList ? `<tr><td colspan="4" style="padding:2px 10px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">Branches: ${branchList}</td></tr>` : ""}`;
      })
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#fff;">
        <div style="background:#2563eb;padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:12px;color:#93c5fd;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Weekly Demand Report</p>
          <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">Week of ${escapeHtml(data.weekLabel)}</h1>
        </div>
        <div style="padding:24px;">
          <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
            <div style="background:#ede9fe;border-radius:8px;padding:12px 16px;flex:1;min-width:100px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#5b21b6;">${data.totalRequests}</div>
              <div style="font-size:11px;color:#5b21b6;text-transform:uppercase;">Total Requests</div>
            </div>
            <div style="background:#dbeafe;border-radius:8px;padding:12px 16px;flex:1;min-width:100px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#1e40af;">${data.totalBrands}</div>
              <div style="font-size:11px;color:#1e40af;text-transform:uppercase;">Brands Requested</div>
            </div>
          </div>

          <h2 style="font-size:15px;color:#111827;margin:0 0 12px;">Top Requested Brands</h2>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;">
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Brand</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Requests</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Top Designs</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Top Sizes</th>
            </tr>
            ${brandRows}
          </table>

          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
            Use this data to guide purchasing decisions and stock allocation for the upcoming week.
          </p>
        </div>
        <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Redbox Apparel &middot; Weekly demand digest &middot; Sent to admin, manager &amp; HQ staff
          </p>
        </div>
      </div>`;

    try {
      await config.resend.emails.send({
        from: config.from,
        to: emails,
        subject: `[RedBox] Weekly Demand Report — ${data.totalRequests} requests, ${data.totalBrands} brands (Week of ${data.weekLabel})`,
        html,
      });
      console.log(`[demandDigest] Sent to ${emails.length} recipients`);
    } catch (err) {
      console.error("[demandDigest] Email failed:", err);
    }
  },
});

// ─── 4. Branch Scores Daily Digest ───────────────────────────────────────────
// Fires daily at 6:30 AM PHT (after scoring at 6 AM).

export const sendBranchScoresDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const config = getResendConfig();
    if (!config) {
      console.warn("[branchScoresDigest] RESEND_API_KEY not set — skipping");
      return;
    }

    const data: BranchScoresData = await ctx.runQuery(
      _internal.notifications.emailDigestHelpers._getBranchScoresDigestData,
      {}
    );
    if (!data) {
      console.log("[branchScoresDigest] No scores — skipping email");
      return;
    }

    const recipients: Recipient[] = await ctx.runQuery(
      _internal.notifications.emailDigestHelpers._getManagementRecipients,
      {}
    );
    const emails = recipients.map((r: Recipient) => r.email).filter(Boolean);
    if (emails.length === 0) return;

    const scoreColor = (score: number) => {
      if (score >= 80) return "#16a34a";
      if (score >= 60) return "#2563eb";
      if (score >= 40) return "#d97706";
      return "#dc2626";
    };

    const scoreBg = (score: number) => {
      if (score >= 80) return "#f0fdf4";
      if (score >= 60) return "#eff6ff";
      if (score >= 40) return "#fffbeb";
      return "#fef2f2";
    };

    const branchRows = data.scores
      .map(
        (s) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escapeHtml(s.branchName)}</td>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;text-align:center;">
            <span style="display:inline-block;padding:4px 12px;border-radius:9999px;font-size:14px;font-weight:700;background:${scoreBg(s.compositeScore)};color:${scoreColor(s.compositeScore)};">${s.compositeScore}</span>
          </td>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;color:#6b7280;">${s.salesVolumeScore}</td>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;color:#6b7280;">${s.stockAccuracyScore}</td>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;color:#6b7280;">${s.fulfillmentSpeedScore}</td>
          <td style="padding:10px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;color:#6b7280;">${s.activeAlertCount}</td>
        </tr>`
      )
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#fff;">
        <div style="background:#0891b2;padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:12px;color:#a5f3fc;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">Daily Branch Performance</p>
          <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">Scores for ${escapeHtml(data.period)}</h1>
        </div>
        <div style="padding:24px;">
          <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
            <div style="background:${scoreBg(data.averageScore)};border-radius:8px;padding:12px 16px;flex:1;min-width:100px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:${scoreColor(data.averageScore)};">${data.averageScore}</div>
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Avg Score</div>
            </div>
            <div style="background:#f9fafb;border-radius:8px;padding:12px 16px;flex:1;min-width:100px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:#111827;">${data.branchCount}</div>
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Branches</div>
            </div>
            ${data.underperformingCount > 0 ? `
            <div style="background:#fef2f2;border-radius:8px;padding:12px 16px;flex:1;min-width:100px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:#dc2626;">${data.underperformingCount}</div>
              <div style="font-size:11px;color:#dc2626;text-transform:uppercase;">Underperforming</div>
            </div>` : ""}
          </div>

          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;">
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Branch</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Score</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Sales</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Stock</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Fulfill</th>
              <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Alerts</th>
            </tr>
            ${branchRows}
          </table>

          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
            Scores are based on sales volume (40%), stock accuracy (35%), and fulfillment speed (25%).
          </p>
        </div>
        <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Redbox Apparel &middot; Daily branch performance digest &middot; Sent to admin, manager &amp; HQ staff
          </p>
        </div>
      </div>`;

    try {
      await config.resend.emails.send({
        from: config.from,
        to: emails,
        subject: `[RedBox] Branch Scores — Avg ${data.averageScore}/100${data.underperformingCount > 0 ? ` (${data.underperformingCount} underperforming)` : ""} — ${data.period}`,
        html,
      });
      console.log(`[branchScoresDigest] Sent to ${emails.length} recipients`);
    } catch (err) {
      console.error("[branchScoresDigest] Email failed:", err);
    }
  },
});
