/**
 * Format centavos to Philippine Peso display string.
 * 14999 → "₱149.99"
 */
export function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centavos / 100);
}

/**
 * Format Unix timestamp ms to Philippine timezone date string.
 * Uses Asia/Manila timezone.
 */
export function formatDate(
  timestamp: number,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  }).format(new Date(timestamp));
}

/**
 * Format Unix timestamp ms to Philippine timezone date+time string.
 */
export function formatDateTime(timestamp: number): string {
  return formatDate(timestamp, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
