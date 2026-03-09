"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Users,
  Building2,
  Package,
  PackageSearch,
  Database,
  LayoutDashboard,
  BarChart3,
  LineChart,
  ArrowLeftRight,
  ClipboardList,
  FileText,
  Settings,
  Tag,
  ImageIcon,
  Sparkles,
  Ruler,
  MapPin,
  Calendar,
  Megaphone,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ROLE_DEFAULT_ROUTES } from "@/lib/routes";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

const ALLOWED_ROLES = ["admin"] as const;

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
};

const adminNavItems: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users, roles: ["admin"] },
  { href: "/admin/branches", label: "Branches", icon: Building2, roles: ["admin"] },
  { href: "/admin/catalog", label: "Catalog", icon: Package, roles: ["admin"] },
  { href: "/admin/inventory", label: "Inventory", icon: PackageSearch, roles: ["admin"] },
  { href: "/admin/settings", label: "Settings", icon: Settings, roles: ["admin"] },
  { href: "/admin/seed", label: "Seed Data", icon: Database, roles: ["admin"] },
];

const managementNavItems: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { href: "/admin/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
  { href: "/admin/analytics", label: "Analytics", icon: LineChart, roles: ["admin"] },
  { href: "/admin/transfers", label: "Transfers", icon: ArrowLeftRight, roles: ["admin"] },
  { href: "/admin/invoices", label: "Invoices", icon: FileText, roles: ["admin"] },
  { href: "/admin/promotions", label: "Promotions", icon: Tag, roles: ["admin"] },
  { href: "/admin/banners", label: "Banners", icon: ImageIcon, roles: ["admin"] },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone, roles: ["admin"] },
  { href: "/admin/hot-deals", label: "Hot Deals", icon: Flame, roles: ["admin"] },
  { href: "/admin/drops", label: "Exclusive Drops", icon: Sparkles, roles: ["admin"] },
  { href: "/admin/audit", label: "Audit Log", icon: ClipboardList, roles: ["admin"] },
  { href: "/admin/size-curves", label: "Size Curves", icon: Ruler, roles: ["admin"] },
  { href: "/admin/expansion", label: "Expansion Intel", icon: MapPin, roles: ["admin"] },
  { href: "/admin/holidays", label: "Holiday Forecast", icon: Calendar, roles: ["admin"] },
];

function NavSection({
  items,
  pathname,
  userRole,
  label,
}: {
  items: NavItem[];
  pathname: string;
  userRole: string;
  label?: string;
}) {
  const visible = items.filter((item) => item.roles.includes(userRole));
  if (visible.length === 0) return null;

  return (
    <div>
      {label && (
        <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
      )}
      {visible.map((item) => {
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

export default function AdminLayout({
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
      !(ALLOWED_ROLES as readonly string[]).includes(currentUser?.role ?? "")
    ) {
      const role = currentUser?.role;
      const defaultRoute = role
        ? ROLE_DEFAULT_ROUTES[role as keyof typeof ROLE_DEFAULT_ROUTES] ?? "/"
        : "/";
      router.replace(defaultRoute);
    }
  }, [currentUser, router]);

  // Loading state
  if (currentUser === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Not an allowed role — will redirect
  if (
    !currentUser ||
    !(ALLOWED_ROLES as readonly string[]).includes(currentUser.role)
  ) {
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="theme-dashboard flex min-h-screen">
        {/* Sidebar */}
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
              <h2 className="text-lg font-semibold">Admin Panel</h2>
            )}
            <p className="text-sm text-muted-foreground">{currentUser.name}</p>
          </div>
          <Separator />
          <nav className="p-2 space-y-1">
            <NavSection
              items={adminNavItems}
              pathname={pathname}
              userRole={currentUser.role}
              label="Administration"
            />
            <Separator className="my-2" />
            <NavSection
              items={managementNavItems}
              pathname={pathname}
              userRole={currentUser.role}
              label="Management"
            />
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </ErrorBoundary>
  );
}
