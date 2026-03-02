"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Bookmark, User, MapPin } from "lucide-react";
import { Syne, Space_Mono, DM_Sans } from "next/font/google";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AnnouncementBar } from "@/components/customer/AnnouncementBar";
import { cn } from "@/lib/utils";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const navItems = [
  { href: "/browse", label: "Home", icon: Home },
  { href: "/branches", label: "Branches", icon: MapPin },
  { href: "/reserve", label: "Reserves", icon: Bookmark },
  { href: "/account", label: "Account", icon: User },
];

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <ErrorBoundary>
      <div
        className={cn(
          "theme-customer min-h-screen flex flex-col bg-background text-foreground font-body",
          syne.variable,
          spaceMono.variable,
          dmSans.variable
        )}
      >
        {/* Announcement Bar */}
        <AnnouncementBar />

        {/* Top header */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
            <Link
              href="/browse"
              className="font-display text-lg font-extrabold uppercase tracking-wider text-foreground"
            >
              <span className="text-primary">RED</span>BOX
            </Link>
            <div className="hidden lg:flex items-center gap-6 ml-6">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-primary",
                    pathname.startsWith(item.href)
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search products..."
                  className="h-9 w-48 rounded-md border border-border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary lg:w-64"
                  readOnly
                />
              </div>
              <Link
                href="/branches"
                className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                aria-label="Find a branch"
              >
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">Find a Branch</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Main content — padded bottom for mobile nav */}
        <main className="flex-1 pb-16 lg:pb-0">{children}</main>

        {/* Bottom navigation — mobile only */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card lg:hidden">
          <div className="flex items-center justify-around h-16">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center min-h-[44px] min-w-[44px] gap-1 text-xs transition-colors",
                  pathname.startsWith(item.href)
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </ErrorBoundary>
  );
}
