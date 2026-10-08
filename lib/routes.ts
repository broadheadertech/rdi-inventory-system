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
  warehouseStaff: "/warehouse/suppliers",
  viewer: "/branch/dashboard",
  driver: "/driver/deliveries",
  supplier: "/supplier/portal",
  merchandiser: "/merchandising/replenishment",
};

/**
 * Maps each protected route group prefix to the roles allowed to access it.
 * Admin has access to all internal route groups.
 */
export const ROLE_ROUTE_ACCESS: Record<string, readonly string[]> = {
  "/admin": ["admin"],
  // Merchandising plans what goes where. It gets its own group rather than a
  // key into /admin: opening the admin area to a non-admin role would also
  // open users, prices and settings, which is not what planning needs.
  "/merchandising": ["admin", "hqStaff", "merchandiser"],
  "/pos": ["admin", "manager", "cashier", "warehouseStaff", "hqStaff"],
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
