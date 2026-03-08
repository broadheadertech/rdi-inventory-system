"use client";

import { useState, useEffect } from "react";

interface FlashSaleCountdownProps {
  endDate: number; // Unix timestamp in milliseconds
}

function calcTimeLeft(endDate: number) {
  const diff = endDate - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    mins: Math.floor((diff / (1000 * 60)) % 60),
    secs: Math.floor((diff / 1000) % 60),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function FlashSaleCountdown({ endDate }: FlashSaleCountdownProps) {
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(endDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calcTimeLeft(endDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [endDate]);

  if (!timeLeft) {
    return (
      <div className="flex items-center justify-center rounded-xl px-6 py-5"
           style={{ backgroundColor: "#0A0A0A" }}>
        <p className="font-display text-lg font-bold uppercase tracking-wider text-white/60">
          Sale Ended
        </p>
      </div>
    );
  }

  const segments: { value: number; label: string }[] = [
    { value: timeLeft.days, label: "DAYS" },
    { value: timeLeft.hours, label: "HOURS" },
    { value: timeLeft.mins, label: "MINS" },
    { value: timeLeft.secs, label: "SECS" },
  ];

  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl px-6 py-5"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      <p
        className="font-display text-xs font-bold uppercase tracking-[0.2em]"
        style={{ color: "#E8192C" }}
      >
        Flash Sale Ends In
      </p>

      <div className="flex items-center gap-2 sm:gap-3">
        {segments.map((seg, i) => (
          <div key={seg.label} className="flex items-center gap-2 sm:gap-3">
            <div className="flex flex-col items-center">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-lg font-mono text-2xl font-bold text-white sm:h-16 sm:w-16 sm:text-3xl"
                style={{ backgroundColor: "#1A1A1A" }}
              >
                {pad(seg.value)}
              </span>
              <span className="mt-1.5 text-[10px] font-bold tracking-widest text-white/50">
                {seg.label}
              </span>
            </div>
            {i < segments.length - 1 && (
              <span
                className="mb-5 text-xl font-bold sm:text-2xl"
                style={{ color: "#E8192C" }}
              >
                :
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
