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
  ClipboardCheck,
  TrendingUp,
  Truck,
  Bot,
  RefreshCw,
  ArrowRightLeft,
  PackageCheck,
  ShieldAlert,
  Ghost,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ROLE_DEFAULT_ROUTES } from "@/lib/routes";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

const ALLOWED_ROLES = ["admin", "hqStaff", "warehouseStaff"];

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const operationsNavItems: NavItem[] = [
  { href: "/warehouse", label: "Dashboard", icon: LayoutDashboard },
  { href: "/warehouse/transfer-requests", label: "Transfer Requests", icon: ClipboardCheck },
  { href: "/warehouse/demand", label: "Demand", icon: TrendingUp },
  { href: "/warehouse/logistics", label: "Logistics", icon: Truck },
  { href: "/warehouse/restock-ai", label: "Restock AI", icon: Bot },
  { href: "/warehouse/auto-replenish", label: "Auto-Replenish", icon: RefreshCw },
  { href: "/warehouse/surge-alerts", label: "Surge Alerts", icon: TrendingUp },
];

const floorNavItems: NavItem[] = [
  { href: "/warehouse/transfers", label: "Transfers", icon: ArrowRightLeft },
  { href: "/warehouse/receiving", label: "Receiving", icon: PackageCheck },
  { href: "/warehouse/quarantine", label: "Quarantine", icon: ShieldAlert },
  { href: "/warehouse/cycle-count", label: "Cycle Count", icon: ClipboardCheck },
  { href: "/warehouse/ghost-stock", label: "Ghost Stock", icon: Ghost },
];

function NavSection({
  items,
  pathname,
  label,
}: {
  items: NavItem[];
  pathname: string;
  label?: string;
}) {
  return (
    <div>
      {label && (
        <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
      )}
      {items.map((item) => {
        const isActive =
          item.href === "/warehouse"
            ? pathname === "/warehouse"
            : pathname.startsWith(item.href);
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

export default function WarehouseLayout({
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
      <div className="theme-warehouse flex min-h-screen">
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
              <h2 className="text-lg font-semibold">Warehouse</h2>
            )}
            <p className="text-sm text-muted-foreground">
              {currentUser.name}
            </p>
          </div>
          <Separator />
          <nav className="p-2 space-y-1">
            <NavSection
              items={operationsNavItems}
              pathname={pathname}
              label="Operations"
            />
            <Separator className="my-2" />
            <NavSection
              items={floorNavItems}
              pathname={pathname}
              label="Warehouse Floor"
            />
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </ErrorBoundary>
  );
}
