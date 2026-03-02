"use client";

import Link from "next/link";

export default function ReservationError() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
      <p className="text-lg text-muted-foreground">
        Reservation information could not be loaded
      </p>
      <Link href="/browse" className="text-sm text-primary hover:underline">
        Back to browse
      </Link>
    </div>
  );
}
