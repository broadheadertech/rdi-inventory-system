import type { Role } from "./constants";

/**
 * Default redirect path for each role after login.
 * Used by middleware and home page for role-based routing.
 */
export const ROLE_DEFAULT_ROUTES: Record<Role, string> = {
  admin: "/admin/users",
  hqStaff: "/warehouse",
  manager: "/branch/dashboard",
  cashier: "/pos",
  warehouseStaff: "/warehouse/transfers",
  viewer: "/branch/dashboard",
  driver: "/driver/deliveries",
  supplier: "/supplier/portal",
};

/**
 * Maps each protected route group prefix to the roles allowed to access it.
 * Admin has access to all internal route groups.
 */
export const ROLE_ROUTE_ACCESS: Record<string, readonly string[]> = {
  "/admin": ["admin"],
  "/pos": ["admin", "manager", "cashier"],
  "/branch": ["admin", "manager", "viewer"],
  "/warehouse": ["admin", "hqStaff", "warehouseStaff"],
  "/driver": ["admin", "driver"],
  "/supplier": ["admin", "supplier"],
};

/**
 * Routes that don't require authentication.
 * Includes auth pages, webhooks, and public-facing customer routes.
 */
export const PUBLIC_ROUTES = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/browse(.*)",
  "/products(.*)",
  "/branches(.*)",
  "/reserve(.*)",
];
