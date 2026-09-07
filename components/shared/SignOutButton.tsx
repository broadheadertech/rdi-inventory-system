"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sign out of a staff session.
 *
 * On an enrolled POS register this is also how you hand the machine back to its
 * terminal identity: signing a person out leaves the device token in place, and
 * TerminalSessionGate immediately signs back in as the register's own account.
 * That is why `redirectTo` defaults to the current POS path rather than the
 * sign-in page when used there.
 */
export function SignOutButton({
  redirectTo = "/sign-in",
  className,
  label = "Sign out",
}: {
  redirectTo?: string;
  className?: string;
  label?: string;
}) {
  const { signOut } = useClerk();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    try {
      await signOut();
      router.push(redirectTo);
    } catch {
      // Clerk failed to end the session — leave the user where they are rather
      // than pretending it worked.
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handle}
      disabled={busy}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
        className
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <LogOut className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}
