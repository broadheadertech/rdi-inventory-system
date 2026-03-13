"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  QrCode,
  Clock,
  UserCheck,
  Sparkles,
  ChevronDown,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ROLE_DEFAULT_ROUTES } from "@/lib/routes";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { StaffNotificationBell } from "@/components/shared/StaffNotificationBell";

const ALLOWED_ROLES = ["admin", "manager", "viewer"];

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const overviewNavItems: NavItem[] = [
  { href: "/branch/command-center", label: "Command Center", icon: Sunrise },
  { href: "/branch/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/branch/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/branch/reports", label: "Reports", icon: FileText },
];

const operationsNavItems: NavItem[] = [
  { href: "/branch/stock", label: "Stock", icon: Package },
  { href: "/branch/transfers", label: "Transfers", icon: ArrowRightLeft },
  { href: "/branch/box-receiving", label: "Receiving", icon: QrCode },
  { href: "/branch/invoices", label: "Invoices", icon: FileText },
  { href: "/branch/reservations", label: "Reservations", icon: CalendarCheck },
  { href: "/branch/quarantine", label: "Quarantine", icon: ShieldAlert },
];

const insightsNavItems: NavItem[] = [
  { href: "/branch/sell-through", label: "Sell-Through", icon: BarChart3 },
  { href: "/branch/inventory-aging", label: "Inventory Aging", icon: Clock },
  { href: "/branch/cross-sell-analytics", label: "Cross-Sell", icon: Sparkles },
  { href: "/branch/demand", label: "Demand", icon: TrendingUp },
  { href: "/branch/alerts", label: "Alerts", icon: Bell },
];

const teamNavItems: NavItem[] = [
  { href: "/branch/champions", label: "Champions", icon: Trophy },
  { href: "/branch/fashion-assistants", label: "Fashion Assistants", icon: UserCheck },
  { href: "/branch/cashiers", label: "Cashiers", icon: Users },
];

function NavSection({
  items,
  pathname,
  label,
}: {
  items: NavItem[];
  pathname: string;
  label: string;
}) {
  const hasActive = items.some((item) => pathname.startsWith(item.href));
  const [open, setOpen] = useState(hasActive);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>
      {open && items.map((item) => {
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
    </div>
  );
}

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
        <aside className="w-60 border-r bg-gray-50/50 print:hidden">
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
            <div className="flex items-center justify-between mt-1">
              <p className="text-sm text-muted-foreground">{currentUser.name}</p>
              <StaffNotificationBell />
            </div>
          </div>
          <Separator />
          <nav className="p-2 space-y-1">
            <NavSection items={overviewNavItems} pathname={pathname} label="Overview" />
            <Separator className="my-2" />
            <NavSection items={operationsNavItems} pathname={pathname} label="Operations" />
            <Separator className="my-2" />
            <NavSection items={insightsNavItems} pathname={pathname} label="Insights" />
            <Separator className="my-2" />
            <NavSection items={teamNavItems} pathname={pathname} label="Team" />
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </ErrorBoundary>
  );
}
