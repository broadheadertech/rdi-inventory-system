import { httpRouter } from "convex/server";
import { clerkWebhook } from "./auth/clerkWebhook";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

export default http;
