"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ROLE_DEFAULT_ROUTES } from "@/lib/routes";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AdminSidebar } from "@/components/shared/AdminSidebar";

const ALLOWED_ROLES = ["admin"] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const router = useRouter();

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
        <AdminSidebar userName={currentUser.name} userRole={currentUser.role} />

        {/* Main content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </ErrorBoundary>
  );
}
