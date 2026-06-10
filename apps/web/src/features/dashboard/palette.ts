import { MOBY_BRAND } from "@/lib/login-brand-colors";

export const BRAND_BLUE_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.blue} 0%, ${MOBY_BRAND.blue} 100%)`;
export const BRAND_YELLOW_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.orangeWarm} 0%, ${MOBY_BRAND.orangeWarm} 100%)`;
export const BRAND_ORANGE_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.orange} 0%, ${MOBY_BRAND.orange} 100%)`;
export const BRAND_BLUE_YELLOW_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.blue} 0%, ${MOBY_BRAND.orangeWarm} 100%)`;
export const BRAND_YELLOW_ORANGE_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.orangeWarm} 0%, ${MOBY_BRAND.orange} 100%)`;
export const BRAND_TRACK = "rgba(0, 107, 255, 0.08)";
export const NEUTRAL_GHOST_GRADIENT = "linear-gradient(90deg, #d1d5db 0%, #9ca3af 100%)";
export const TEXT_SAFE = "min-w-0 break-words [overflow-wrap:anywhere]";

export const LIFECYCLE_PALETTE = {
  "Active Paid": BRAND_BLUE_GRADIENT,
  "Active Free": BRAND_YELLOW_GRADIENT,
  Churned: BRAND_ORANGE_GRADIENT,
  Ghost: NEUTRAL_GHOST_GRADIENT,
};

export const CHURN_PALETTE = {
  High: BRAND_ORANGE_GRADIENT,
  Medium: BRAND_YELLOW_ORANGE_GRADIENT,
  Low: BRAND_BLUE_GRADIENT,
};

export const CREDIT_PALETTE = {
  Critical: BRAND_ORANGE_GRADIENT,
  Warning: BRAND_YELLOW_ORANGE_GRADIENT,
  Monitor: BRAND_YELLOW_GRADIENT,
  Stable: BRAND_BLUE_GRADIENT,
};

/** Low → blue, mid → warm orange, high → orange band coloring for revenue values. */
export function revenueBandColor(value: number, min: number, max: number): string {
  const score = max > min ? ((value - min) / (max - min)) * 100 : 100;
  if (score >= 67) return MOBY_BRAND.orange;
  if (score >= 34) return MOBY_BRAND.orangeWarm;
  return MOBY_BRAND.blue;
}
