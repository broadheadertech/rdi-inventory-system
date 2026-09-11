"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Resend } from "resend";

// ─── Notification type labels & email accent colors ────────────────────────────

type NotificationType =
  | "transfer_requested"
  | "transfer_approved"
  | "transfer_rejected"
  | "transfer_packed"
  | "driver_assigned"
  | "driver_in_transit"
  | "driver_arrived"
  | "driver_delivered"
  | "transfer_confirmed"
  | "transfer_cancelled";

const ACCENT_COLORS: Record<NotificationType, string> = {
  transfer_requested: "#2563eb",
  transfer_approved:  "#16a34a",
  transfer_rejected:  "#dc2626",
  transfer_packed:    "#9333ea",
  driver_assigned:    "#0891b2",
  driver_in_transit:  "#d97706",
  driver_arrived:     "#ea580c",
  driver_delivered:   "#16a34a",
  transfer_confirmed: "#15803d",
  transfer_cancelled: "#6b7280",
};

// ─── _processNotification ─────────────────────────────────────────────────────
// Scheduled after every logistics mutation step.
// Resolves recipients, inserts in-app notifications, sends emails.
// ALL errors are silently caught — this must never break the calling mutation.

export const _processNotification = internalAction({
  args: {
    type: v.string(),
    transferId: v.id("transfers"),
    extra: v.optional(v.object({ reason: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    try {
      const type = args.type as NotificationType;

      // Fetch transfer context
      const transfer = await ctx.runQuery(
        internal.logistics.notificationRecords._getTransferContext,
        { transferId: args.transferId }
      );
      if (!transfer) return;

      const { fromBranchName, toBranchName } = transfer;
      const shortId = (args.transferId as string).slice(-6).toUpperCase();

      // Build message
      const TEMPLATES: Record<NotificationType, { title: string; body: string }> = {
        transfer_requested: {
          title: "New Transfer Request",
          body: `${toBranchName} has requested stock from ${fromBranchName} — TRF-${shortId}.`,
        },
        transfer_approved: {
          title: "Transfer Approved",
          body: `Your transfer TRF-${shortId} has been approved. ${fromBranchName} is preparing your order.`,
        },
        transfer_rejected: {
          title: "Transfer Rejected",
          body: `Your transfer TRF-${shortId} was rejected${args.extra?.reason ? `: ${args.extra.reason}` : "."}`,
        },
        transfer_packed: {
          title: "Transfer Packed & Ready",
          body: `TRF-${shortId} (${fromBranchName} → ${toBranchName}) has been packed and is awaiting dispatch.`,
        },
        driver_assigned: {
          title: "Delivery Assignment",
          body: `You've been assigned to deliver TRF-${shortId} from ${fromBranchName} to ${toBranchName}.`,
        },
        driver_in_transit: {
          title: "Driver En Route",
          body: `Transfer TRF-${shortId} from ${fromBranchName} is now on its way to your branch.`,
        },
        driver_arrived: {
          title: "Driver Has Arrived",
          body: `Driver has arrived at ${toBranchName} with TRF-${shortId}. Please prepare to receive.`,
        },
        driver_delivered: {
          title: "Transfer Handed Over",
          body: `The driver handed over TRF-${shortId} from ${fromBranchName}. Count it in Receiving to add it to your stock.`,
        },
        transfer_confirmed: {
          title: "Receipt Confirmed",
          body: `${toBranchName} confirmed receipt of transfer TRF-${shortId}.`,
        },
        transfer_cancelled: {
          title: "Transfer Cancelled",
          body: `Transfer TRF-${shortId} (${fromBranchName} → ${toBranchName}) has been cancelled.`,
        },
      };

      const { title, body } = TEMPLATES[type];

      // Resolve who to notify
      const recipients = await ctx.runQuery(
        internal.logistics.notificationRecords._resolveRecipients,
        {
          type,
          requestedById: transfer.requestedById,
          driverId: transfer.driverId ?? null,
          fromBranchId: transfer.fromBranchId,
          toBranchId: transfer.toBranchId,
        }
      );

      if (recipients.length === 0) return;

      // Insert in-app notifications
      await ctx.runMutation(internal.logistics.notificationRecords._bulkInsert, {
        notifications: recipients.map((r) => ({
          userId: r.id,
          type,
          title,
          body,
          transferId: args.transferId,
        })),
      });

      // Email (optional — skips gracefully if RESEND_API_KEY is not set)
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) return;

      const emails = recipients.map((r) => r.email).filter(Boolean) as string[];
      if (emails.length === 0) return;

      const resend = new Resend(apiKey);
      const from   = process.env.RESEND_FROM_EMAIL ?? "RedBox <onboarding@resend.dev>";
      const accent  = ACCENT_COLORS[type] ?? "#2563eb";

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <div style="background:${accent};padding:20px 24px;">
            <h1 style="color:#fff;font-size:18px;margin:0;font-weight:700;">${title}</h1>
          </div>
          <div style="padding:24px 24px 16px;">
            <p style="font-size:15px;color:#111827;margin:0 0 20px;">${body}</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;">
              <p style="margin:0;font-size:12px;color:#6b7280;">
                Transfer: <strong style="color:#111827;">TRF-${shortId}</strong>
                &nbsp;·&nbsp; ${fromBranchName} → ${toBranchName}
              </p>
            </div>
          </div>
          <div style="padding:0 24px 24px;font-size:12px;color:#9ca3af;">
            Redbox Apparel &middot; This is an automated internal notification.
          </div>
        </div>`;

      for (const email of emails) {
        try {
          await resend.emails.send({
            from,
            to: [email],
            subject: `[RedBox] ${title} — TRF-${shortId}`,
            html,
          });
        } catch (err) {
          console.error(`[staffNotify] Email to ${email} failed:`, err);
        }
      }
    } catch (err) {
      console.error("[staffNotify] _processNotification failed:", err);
      // Intentionally swallowed — notifications must never block logistics ops
    }
  },
});
