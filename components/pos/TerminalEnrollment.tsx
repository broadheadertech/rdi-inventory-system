"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { setDeviceToken } from "@/lib/deviceToken";
import { AlertTriangle, MonitorSmartphone, ShieldCheck } from "lucide-react";

function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  return "Enrollment failed. Check the code and try again.";
}

/**
 * Shown on any device that is not a registered POS terminal.
 *
 * A manager generates an 8-character code in the back office (Branch → Terminals),
 * then types it here on the register itself. The device receives its token and
 * is bound from that point on; phones and home PCs never get past this screen.
 *
 * `onSkip` is supplied only while POS_REQUIRE_TERMINAL is off, so registers can be
 * enrolled one at a time without the unenrolled ones being locked out mid-rollout.
 * Once the flag is on there is no skip and this screen is a hard gate.
 *
 * Enrollment needs no existing session: on a fresh register it also redeems the
 * returned Clerk ticket, so the device signs itself in as its terminal account
 * without anyone typing an email. When somebody is *already* signed in (a
 * manager binding a register mid-rollout) the ticket is left unredeemed so
 * their own session is not swapped out from under them.
 */
export function TerminalEnrollment({
  onEnrolled,
  onSkip,
  notice,
}: {
  onEnrolled: () => void;
  onSkip?: () => void;
  notice?: string;
}) {
  const enrollTerminal = useAction(api.pos.terminalsActions.enrollTerminal);
  const { isSignedIn } = useAuth();
  const { signIn, setActive } = useSignIn();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleEnroll() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 8) {
      setError("Enrollment codes are 8 characters");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const result = await enrollTerminal({ code: trimmed });

      // Guard against the server not returning one: localStorage.setItem would
      // happily store the string "undefined", which then reads back as an
      // unrecognised token and is refused on every request — while the terminal
      // row exists server-side, so the screen just asks to register again.
      if (typeof result.deviceToken !== "string" || result.deviceToken.length < 32) {
        setError(
          "The server did not return a device token, so this machine was not bound. Ask your manager to revoke this terminal and issue a new code."
        );
        return;
      }

      // The token is returned exactly once — persist before anything else.
      if (!setDeviceToken(result.deviceToken)) {
        setError(
          "This browser is blocking site data, so the terminal can't be registered. Turn off private browsing and try again."
        );
        return;
      }
      // Fresh register — redeem the ticket so it is signed in as its terminal
      // account straight away, with no sign-in screen in between.
      if (!isSignedIn && result.ticket && signIn && setActive) {
        const attempt = await signIn.create({ strategy: "ticket", ticket: result.ticket });
        if (attempt.status === "complete" && attempt.createdSessionId) {
          await setActive({ session: attempt.createdSessionId });
        }
      }

      onEnrolled();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-lg">
        <div className="space-y-1 text-center">
          <MonitorSmartphone className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-bold">Register this terminal</h1>
          <p className="text-sm text-muted-foreground">
            This device isn&apos;t registered as a POS terminal yet. Ask your manager for an
            enrollment code.
          </p>
        </div>

        {notice && (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </p>
        )}

        <div className="space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEnroll();
            }}
            placeholder="XXXXXXXX"
            maxLength={8}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border bg-background px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] uppercase outline-none focus:ring-2 focus:ring-primary"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            onClick={handleEnroll}
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Registering..." : "Register terminal"}
          </button>
        </div>

        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Skip for now
          </button>
        )}

        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Registering binds the POS to this computer. Cashiers will not be able to open a
            shift from a phone or any other unregistered device.
          </span>
        </p>
      </div>
    </div>
  );
}
