/**
 * App-wide 1Moby design tokens (brand colors + intro assets), sourced from the
 * 1moby.com intro CSS. Despite the filename, these are used across the whole app,
 * not just the login page — `MOBY_BRAND` is the single source for brand colors
 * (see features/dashboard/palette.ts for derived gradients/palettes).
 */
export const MOBY_BRAND = {
  dark: "#1D1F2A",
  blue: "#006BFF",
  blueLight: "#1893F0",
  orange: "#FC4C02",
  orangeWarm: "#FFA400",
  radialGlow: "rgba(7, 29, 126, 0.608)",
} as const;

export const INTRO_ASSETS = {
  aboutBg: "/assets/intro/about_bg.webp",
  introSmBg: "/assets/intro/intro_sm_bg.webp",
  logo: "/assets/images/logo-1moby.svg",
} as const;
