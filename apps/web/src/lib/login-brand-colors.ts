/** 1Moby brand colors — from 1moby.com intro CSS */
export const MOBY_BRAND = {
  dark: "#1D1F2A",
  blue: "#006BFF",
  blueLight: "#1893F0",
  orange: "#FC4C02",
  orangeWarm: "#FFA400",
  radialGlow: "rgba(7, 29, 126, 0.608)",
} as const;

/** @deprecated use MOBY_BRAND */
export const LOGIN_BRAND = {
  blue: MOBY_BRAND.blue,
  blueLight: MOBY_BRAND.blueLight,
  blueGlow: MOBY_BRAND.blueLight,
  dark: MOBY_BRAND.dark,
  darkDeep: "#000000",
  orange: MOBY_BRAND.orangeWarm,
  orangeDeep: MOBY_BRAND.orange,
} as const;

export const INTRO_ASSETS = {
  aboutBg: "/assets/intro/about_bg.webp",
  introSmBg: "/assets/intro/intro_sm_bg.webp",
  logo: "/assets/images/logo-1moby.svg",
} as const;
