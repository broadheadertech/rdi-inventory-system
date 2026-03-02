"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ROLE_DEFAULT_ROUTES } from "@/lib/routes";

export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const currentUser = useQuery(
    api.auth.users.getCurrentUser,
    isSignedIn ? undefined : "skip"
  );
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && currentUser) {
      const defaultRoute =
        ROLE_DEFAULT_ROUTES[
          currentUser.role as keyof typeof ROLE_DEFAULT_ROUTES
        ] ?? "/";
      if (defaultRoute !== "/") {
        router.replace(defaultRoute);
      }
    }
  }, [isLoaded, isSignedIn, currentUser, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">RedBox Apparel</h1>
      <p className="mt-4 text-muted-foreground">
        Unified commerce platform
      </p>
    </main>
  );
}
