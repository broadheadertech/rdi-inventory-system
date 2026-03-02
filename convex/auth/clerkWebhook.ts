import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { VALID_ROLES, type ValidRole } from "../_helpers/permissions";

export const clerkWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET is not set");
    return new Response("Server configuration error", { status: 500 });
  }

  // Get svix headers for verification
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Get raw body as string — svix needs the raw payload, NOT parsed JSON
  const payload = await request.text();

  // Verify webhook signature
  const wh = new Webhook(webhookSecret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Handle events
  const eventType = evt.type;

  if (eventType === "user.created" || eventType === "user.updated") {
    const { id, email_addresses, first_name, last_name, public_metadata } =
      evt.data;
    const email = email_addresses?.[0]?.email_address ?? "";
    const name =
      [first_name, last_name].filter(Boolean).join(" ") || email;
    const rawRole = (public_metadata?.role as string) ?? "viewer";
    const role: ValidRole = VALID_ROLES.has(rawRole as ValidRole)
      ? (rawRole as ValidRole)
      : "viewer";

    // Check if user already exists in Convex
    const existingUser = await ctx.runQuery(
      internal.auth.users.getByClerkId,
      { clerkId: id }
    );

    if (existingUser) {
      await ctx.runMutation(internal.auth.users.updateFromWebhook, {
        id: existingUser._id,
        email,
        name,
        role,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.runMutation(internal.auth.users.createFromWebhook, {
        clerkId: id,
        email,
        name,
        role,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  if (eventType === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      await ctx.runMutation(internal.auth.users.deactivateByClerkId, {
        clerkId: id,
      });
    }
  }

  return new Response("OK", { status: 200 });
});
