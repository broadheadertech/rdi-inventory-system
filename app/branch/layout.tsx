"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Package,
  ArrowRightLeft,
  TrendingUp,
  Bell,
  CalendarCheck,
  FileText,
  ShieldAlert,
  Trophy,
  Sunrise,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ROLE_DEFAULT_ROUTES } from "@/lib/routes";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

const ALLOWED_ROLES = ["admin", "manager", "viewer"];

const navItems = [
  { href: "/branch/command-center", label: "Command Center", icon: Sunrise },
  { href: "/branch/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/branch/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/branch/stock", label: "Stock", icon: Package },
  { href: "/branch/transfers", label: "Transfers", icon: ArrowRightLeft },
  { href: "/branch/invoices", label: "Invoices", icon: FileText },
  { href: "/branch/reservations", label: "Reservations", icon: CalendarCheck },
  { href: "/branch/demand", label: "Demand", icon: TrendingUp },
  { href: "/branch/alerts", label: "Alerts", icon: Bell },
  { href: "/branch/quarantine", label: "Quarantine", icon: ShieldAlert },
  { href: "/branch/champions", label: "Champions", icon: Trophy },
];

export default function BranchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const siteAssets = useQuery(api.admin.settings.getSiteAssets);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (
      currentUser !== undefined &&
      (!currentUser || !ALLOWED_ROLES.includes(currentUser.role))
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

  if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role)) {
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="theme-dashboard flex min-h-screen">
        <aside className="w-60 border-r bg-gray-50/50">
          <div className="p-4">
            {siteAssets?.siteLogoUrl ? (
              <Image
                src={siteAssets.siteLogoUrl}
                alt="Logo"
                width={160}
                height={40}
                className="h-8 w-auto object-contain mb-1"
              />
            ) : (
              <h2 className="text-lg font-semibold">Branch Manager</h2>
            )}
            <p className="text-sm text-muted-foreground">
              {currentUser.name}
            </p>
          </div>
          <Separator />
          <nav className="p-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </ErrorBoundary>
  );
}
