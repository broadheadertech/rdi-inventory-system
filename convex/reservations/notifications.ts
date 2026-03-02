"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Resend } from "resend";

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── Action: Send Reservation Expiry Email ──────────────────────────────────

export const sendReservationExpiredEmail = internalAction({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        "[sendReservationExpiredEmail] RESEND_API_KEY not configured — skipping email notification"
      );
      return;
    }

    const data = await ctx.runQuery(
      internal.reservations.manage._getReservationNotificationData,
      { reservationId: args.reservationId }
    );

    if (!data) {
      console.warn(
        `[sendReservationExpiredEmail] Reservation ${args.reservationId} not found — skipping`
      );
      return;
    }

    if (data.staffEmails.length === 0) {
      console.warn(
        `[sendReservationExpiredEmail] No staff emails found for branch "${escapeHtml(data.branchName)}" — skipping`
      );
      return;
    }

    const resend = new Resend(apiKey);

    const fromAddress =
      process.env.RESEND_FROM_EMAIL ||
      "RedBox Notifications <onboarding@resend.dev>";

    const productDesc = [data.styleName, data.size, data.color]
      .filter(Boolean)
      .join(" — ");

    const expiryDate = new Date(data.expiresAt).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });

    // HTML-escape all user-provided values to prevent injection
    const safeCustomerName = escapeHtml(data.customerName);
    const safeCustomerPhone = escapeHtml(data.customerPhone);
    const safeConfirmationCode = escapeHtml(data.confirmationCode);
    const safeProductDesc = escapeHtml(productDesc);
    const safeBranchName = escapeHtml(data.branchName);
    const safeExpiryDate = escapeHtml(expiryDate);

    try {
      await resend.emails.send({
        from: fromAddress,
        to: data.staffEmails,
        subject: `[RedBox] Reservation Expired — ${data.confirmationCode}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Reservation Expired</h2>
            <p>A customer reservation has expired without being picked up.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Confirmation Code</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeConfirmationCode}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Customer Name</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeCustomerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Phone</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeCustomerPhone}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Product</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeProductDesc}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Branch</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeBranchName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Expired At</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeExpiryDate}</td>
              </tr>
            </table>
            <p style="color: #6b7280; font-size: 14px;">
              Reserved stock has been automatically restored to available inventory.
            </p>
          </div>
        `,
      });
    } catch (err) {
      console.error(
        "[sendReservationExpiredEmail] Failed to send email:",
        err
      );
      // Do NOT throw — email failure should not block the cron job
    }
  },
});
