"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const DEFAULT_MESSAGES = [
  "RESERVE NOW, PICK UP TODAY",
  "NEW DROPS EVERY FRIDAY",
  "FREE SHIPPING ON ORDERS ABOVE \u20B12,500",
];

interface AnnouncementBarProps {
  messages?: string[];
}

export function AnnouncementBar({
  messages = DEFAULT_MESSAGES,
}: AnnouncementBarProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("rb-announcement-dismissed") === "1") {
      setDismissed(true);
    }
  }, []);

  if (dismissed || messages.length === 0) return null;

  // Double the messages for seamless loop
  const doubled = [...messages, ...messages];

  return (
    <div className="relative flex items-center overflow-hidden bg-[var(--customer-accent)] text-white">
      <div className="animate-marquee flex whitespace-nowrap py-2">
        {doubled.map((msg, i) => (
          <span
            key={i}
            className="font-mono mx-8 text-xs font-bold tracking-widest uppercase"
          >
            {msg}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          localStorage.setItem("rb-announcement-dismissed", "1");
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/20"
        aria-label="Dismiss announcement"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
