import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Route constants (inlined — path aliases can't be bundled for Edge runtime)
// ---------------------------------------------------------------------------

const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/api/webhooks",
  "/browse",
  "/products",
  "/branches",
  "/reserve",
  "/search",
  "/cart",
  "/checkout",
  "/wishlist",
  "/account",
  "/bootstrap",
];

const ROLE_ROUTE_ACCESS: Record<string, readonly string[]> = {
  "/admin": ["admin"],
  "/pos": ["admin", "manager", "cashier"],
  "/branch": ["admin", "manager", "viewer"],
  "/warehouse": ["admin", "hqStaff", "warehouseStaff"],
  "/driver": ["admin", "driver"],
  "/supplier": ["admin", "supplier"],
};

const ROLE_DEFAULT_ROUTES: Record<string, string> = {
  admin: "/admin/users",
  hqStaff: "/warehouse",
  manager: "/branch/dashboard",
  cashier: "/pos",
  warehouseStaff: "/warehouse/transfers",
  viewer: "/branch/dashboard",
  driver: "/driver/deliveries",
  supplier: "/supplier/portal",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

interface ClerkJwtPayload {
  exp?: number;
  metadata?: { role?: string };
}

/** Decode the JWT payload without verifying the signature (routing only). */
function decodeClerkSession(token: string): ClerkJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Base64url → Base64 with proper padding, then decode
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw.padEnd(raw.length + ((4 - (raw.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as ClerkJwtPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware
//
// Security model:
//   - Middleware: lightweight routing/redirect only (no crypto verification).
//   - Convex backend: full JWT verification via requireRole() / withBranchScope().
//   - @clerk/shared v3.x has no edge-light exports for #crypto / #safe-node-apis,
//     so clerkMiddleware is intentionally avoided here.
// ---------------------------------------------------------------------------

export default function middleware(req: NextRequest) {
  try {
    const pathname = req.nextUrl.pathname;

    // Public paths — no auth required
    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }

    // Read Clerk session JWT from cookie
    const sessionToken = req.cookies.get("__session")?.value;
    if (!sessionToken) {
      const url = req.nextUrl.clone();
      url.pathname = "/sign-in";
      url.searchParams.set("redirect_url", pathname);
      return NextResponse.redirect(url);
    }

    const payload = decodeClerkSession(sessionToken);

    // Malformed or expired token → force re-login
    if (
      !payload ||
      (payload.exp !== undefined && payload.exp < Date.now() / 1000)
    ) {
      const url = req.nextUrl.clone();
      url.pathname = "/sign-in";
      url.searchParams.set("redirect_url", pathname);
      return NextResponse.redirect(url);
    }

    const role = payload.metadata?.role;

    // Role-based route access check — only enforce when role claim is present.
    // If the session token has no `metadata.role` claim (e.g. Clerk session token
    // customization isn't configured), fall through and let the per-layout guard
    // read the role from Convex. Avoids a redirect loop when the JWT is claim-less.
    if (role) {
      for (const [prefix, allowedRoles] of Object.entries(ROLE_ROUTE_ACCESS)) {
        if (pathname === prefix || pathname.startsWith(prefix + "/")) {
          if (!allowedRoles.includes(role)) {
            const defaultRoute = ROLE_DEFAULT_ROUTES[role] ?? "/";
            const url = req.nextUrl.clone();
            url.pathname = defaultRoute;
            url.search = "";
            return NextResponse.redirect(url);
          }
          break;
        }
      }
    }

    return NextResponse.next();
  } catch {
    // Never block a request due to a middleware error
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
