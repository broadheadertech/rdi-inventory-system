"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Mail, Phone, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/formatters";

export function SendReceiptForm({
  transactionId,
  onSent,
}: {
  transactionId: Id<"transactions">;
  onSent?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"email" | "sms">("email");
  const [destination, setDestination] = useState("");
  const [sending, setSending] = useState(false);

  const sendDigitalReceipt = useMutation(api.pos.receipts.sendDigitalReceipt);
  const history = useQuery(api.pos.receipts.getReceiptHistory, {
    transactionId,
  });

  async function handleSend() {
    const trimmed = destination.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      await sendDigitalReceipt({
        transactionId,
        type: activeTab,
        destination: trimmed,
      });
      toast.success(
        activeTab === "email"
          ? `Receipt emailed to ${trimmed}`
          : `Receipt sent via SMS to ${trimmed}`
      );
      setDestination("");
      onSent?.();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.includes("DUPLICATE")
          ? "Receipt already sent to this destination"
          : "Failed to send receipt";
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex rounded-lg border border-border bg-muted/30 p-1">
        <button
          onClick={() => {
            setActiveTab("email");
            setDestination("");
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            activeTab === "email"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Mail className="h-4 w-4" />
          Email
        </button>
        <button
          onClick={() => {
            setActiveTab("sms");
            setDestination("");
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            activeTab === "sms"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Phone className="h-4 w-4" />
          SMS
        </button>
      </div>

      {/* Input + Send */}
      <div className="flex gap-2">
        <input
          type={activeTab === "email" ? "email" : "tel"}
          placeholder={
            activeTab === "email" ? "customer@email.com" : "09XX-XXX-XXXX"
          }
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
        />
        <Button
          onClick={handleSend}
          disabled={sending || !destination.trim()}
          size="sm"
          className="gap-1.5"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send
        </Button>
      </div>

      {/* History */}
      {history && history.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Previously sent
          </p>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
            {history.map((receipt) => (
              <div
                key={receipt._id}
                className="flex items-center gap-2 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                {receipt.type === "email" ? (
                  <Mail className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate text-foreground">
                  {receipt.destination}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDateTime(receipt.sentAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
