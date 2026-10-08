"use client";

// app/merchandising/layout.tsx — the merchandising area.
//
// Its own route group rather than a corner of /admin. Merchandising plans what
// goes where; it has no business with users, prices or settings, and the admin
// layout gates the whole area at once — so letting a merchandiser in there
// would have let them in everywhere. Admin and HQ are admitted too, since both
// already plan pushes.
//
// The middleware gates this prefix as well (ROLE_ROUTE_ACCESS in middleware.ts
// and lib/routes.ts, which keep separate copies). This check is the second
// line: it decides what renders, and every query behind it enforces the role
// again on the server.

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { ROLE_DEFAULT_ROUTES } from "@/lib/routes";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { PackagePlus, Sparkles } from "lucide-react";

const ALLOWED_ROLES = ["admin", "hqStaff", "merchandiser"] as const;

const navItems = [
  {
    href: "/merchandising/replenishment",
    label: "Replenishment",
    icon: PackagePlus,
  },
];

export default function MerchandisingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (
      currentUser !== undefined &&
      !(ALLOWED_ROLES as readonly string[]).includes(currentUser?.role ?? "")
    ) {
      const role = currentUser?.role;
      const defaultRoute = role
        ? ROLE_DEFAULT_ROUTES[role as keyof typeof ROLE_DEFAULT_ROUTES] ?? "/"
        : "/";
      router.replace(defaultRoute);
    }
  }, [currentUser, router]);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Not an allowed role — the effect above is redirecting.
  if (
    !currentUser ||
    !(ALLOWED_ROLES as readonly string[]).includes(currentUser.role)
  ) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
          <Link
            href="/merchandising/replenishment"
            className="flex items-center gap-2 font-semibold"
          >
            <Sparkles className="h-5 w-5 text-primary" />
            Merchandising
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {currentUser.name}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
