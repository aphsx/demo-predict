/**
 * Shared display formatters. Single source of truth — do not redefine
 * per-page copies of these helpers.
 */

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ฿`;
  return `${Math.round(value).toLocaleString()} ฿`;
}

export function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toLocaleString();
}

export function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M credits`;
  return `${value.toLocaleString()} credits`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-06" → "Jun" */
export function formatMonth(value: string): string {
  const [, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  return MONTH_NAMES[monthIndex] ?? value;
}
