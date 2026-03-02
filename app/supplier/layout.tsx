"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export default function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = useQuery(api.auth.users.getCurrentUser);
  const router = useRouter();

  useEffect(() => {
    if (currentUser !== undefined) {
      if (
        !currentUser ||
        (currentUser.role !== "supplier" && currentUser.role !== "admin")
      ) {
        router.replace("/");
      }
    }
  }, [currentUser, router]);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="theme-supplier min-h-screen">{children}</div>
    </ErrorBoundary>
  );
}
