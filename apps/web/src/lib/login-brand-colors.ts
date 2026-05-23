/**
 * Colors sampled from the 1Moby hero background reference (1024×537).
 */
export const LOGIN_BRAND = {
  blue: "#004AFD",
  blueLight: "#3575FA",
  blueGlow: "#2487E5",
  dark: "#272027",
  darkDeep: "#1F1A22",
  orange: "#E0560D",
  orangeDeep: "#D45512",
} as const;

/**
 * Steep tilted S through screen center (720, 450): endpoints symmetric around x=720.
 */
export const LOGIN_CURVE_PATH = "M 320 900 C 510 980, 930 -40, 1120 0";

export const LOGIN_RIGHT_CLIP = `${LOGIN_CURVE_PATH} L 1440 0 L 1440 900 L 320 900 Z`;
