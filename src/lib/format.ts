export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    amount,
  );
}

/** ₹12.5L / ₹1.2Cr style for stat cards. */
export function formatInrCompact(amount: number): string {
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `₹${amount}`;
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
