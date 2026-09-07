"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getDeviceToken, clearDeviceToken } from "@/lib/deviceToken";
import { TerminalEnrollment } from "@/components/pos/TerminalEnrollment";
import { Loader2, MonitorX } from "lucide-react";

function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  return "Couldn't start the terminal session.";
}

type GateState = "resolving" | "signingIn" | "needsEnrollment" | "failed" | "ready";

/**
 * Removes the sign-in screen from the till.
 *
 * A register never has anyone type an email or password. Once enrolled it holds
 * a device token, and this gate exchanges that token for a short-lived Clerk
 * sign-in ticket, redeeming it silently. The same path runs on first boot and
 * every time the session later lapses, so the till comes back on its own after
 * a reboot, a power cut, or an expired session.
 *
 * Cashiers still identify themselves at the ShiftGate inside — that is what
 * puts a name on the shift. This gate only establishes *which register* this is.
 */
export function TerminalSessionGate({ children }: { children: React.ReactNode }) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const createTerminalSession = useAction(api.pos.terminalsActions.createTerminalSession);

  // undefined = not yet read from localStorage (SSR-safe)
  const [deviceToken, setDeviceTokenState] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<GateState>("resolving");
  const [error, setError] = useState("");

  // One attempt per mount — Clerk tickets are single use, so a retry loop would
  // burn tickets against an already-consumed one.
  const attempted = useRef(false);

  useEffect(() => {
    setDeviceTokenState(getDeviceToken());
  }, []);

  useEffect(() => {
    if (!authLoaded || !signInLoaded || deviceToken === undefined) return;

    // Already signed in (a register with a live session, or a manager visiting
    // the POS from their own account) — nothing to do.
    if (isSignedIn) {
      setState("ready");
      return;
    }

    if (!deviceToken) {
      setState("needsEnrollment");
      return;
    }

    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      setState("signingIn");
      try {
        const { ticket } = await createTerminalSession({ deviceToken });

        const result = await signIn!.create({ strategy: "ticket", ticket });
        if (result.status !== "complete" || !result.createdSessionId) {
          throw new Error("Clerk did not complete the ticket sign-in");
        }
        await setActive!({ session: result.createdSessionId });
        // isSignedIn flips on the next render and the effect above takes over.
      } catch (err) {
        const message = getErrorMessage(err);

        // Token no longer valid — drop it and fall back to enrollment so the
        // register can be re-registered without clearing browser data by hand.
        const isTerminalProblem =
          err && typeof err === "object" && "data" in err &&
          typeof (err as { data: unknown }).data === "object" &&
          (err as { data: { code?: string } }).data?.code?.startsWith("TERMINAL_");

        if (isTerminalProblem) {
          clearDeviceToken();
          setDeviceTokenState(null);
          setError(message);
          setState("needsEnrollment");
          return;
        }

        setError(message);
        setState("failed");
      }
    })();
  }, [
    authLoaded,
    signInLoaded,
    isSignedIn,
    deviceToken,
    createTerminalSession,
    signIn,
    setActive,
  ]);

  if (state === "ready" && isSignedIn) {
    return <>{children}</>;
  }

  if (state === "needsEnrollment") {
    return (
      <TerminalEnrollment
        notice={error || undefined}
        onEnrolled={() => {
          attempted.current = false;
          setDeviceTokenState(getDeviceToken());
          setError("");
          setState("resolving");
        }}
      />
    );
  }

  if (state === "failed") {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-center shadow-lg">
          <MonitorX className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-bold">Terminal couldn&apos;t start</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => {
              attempted.current = false;
              setError("");
              setState("resolving");
            }}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {state === "signingIn" ? "Starting terminal..." : "Loading..."}
      </p>
    </div>
  );
}
