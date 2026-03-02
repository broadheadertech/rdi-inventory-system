"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

const ALLOWED_ROLES = ["admin", "driver"];

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const router = useRouter();

  useEffect(() => {
    if (currentUser !== undefined && !currentUser) {
      router.replace("/");
    }
    if (currentUser && !ALLOWED_ROLES.includes(currentUser.role)) {
      router.replace("/");
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
      <div className="theme-driver min-h-screen bg-background">{children}</div>
    </ErrorBoundary>
  );
}
