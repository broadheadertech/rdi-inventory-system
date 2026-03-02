// components/inventory/StatusPill.tsx — Stock status badge (In Stock / Low Stock / Out of Stock)

import { cn } from "@/lib/utils";

interface StatusPillProps {
  quantity: number;
  lowStockThreshold?: number;
}

export function StatusPill({ quantity, lowStockThreshold = 5 }: StatusPillProps) {
  let label: string;
  let className: string;

  if (quantity === 0) {
    label = "Out of Stock";
    className = "bg-red-100 text-red-700 border-red-200";
  } else if (quantity <= lowStockThreshold) {
    label = "Low Stock";
    className = "bg-amber-100 text-amber-700 border-amber-200";
  } else {
    label = "In Stock";
    className = "bg-green-100 text-green-700 border-green-200";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {label}
    </span>
  );
}
