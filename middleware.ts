import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { PUBLIC_ROUTES, ROLE_ROUTE_ACCESS, ROLE_DEFAULT_ROUTES } from "@/lib/routes";

// Public routes — no auth required
const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;

  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return;
  }

  // Check auth state
  const authState = await auth();

  // Redirect to sign-in if unauthenticated
  if (!authState.userId) {
    return (await auth.protect()) as unknown as NextResponse;
  }

  // Extract role from session claims
  const sessionClaims = authState.sessionClaims as Record<string, unknown>;
  const metadata = sessionClaims?.metadata as Record<string, unknown> | undefined;
  const role = metadata?.role as string | undefined;

  // Check role-based route access
  for (const [prefix, allowedRoles] of Object.entries(ROLE_ROUTE_ACCESS)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!role || !allowedRoles.includes(role)) {
        const defaultRoute = role
          ? ROLE_DEFAULT_ROUTES[role as keyof typeof ROLE_DEFAULT_ROUTES] ?? "/"
          : "/";
        return NextResponse.redirect(new URL(defaultRoute, req.url));
      }
      break;
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
