/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        moby: {
          blue: "#006bff",
          orange: "#fc4c02",
          yellow: "#ffa400",
          dark: "#0b0b0b",
          light: "#e2ebf2",
          gray: "#6b6b6b",
        },
        navy: {
          950: "#0b0b0b",
          900: "#111111",
          800: "#1a1a1a",
          700: "#222222",
          600: "#333333",
        },
        brand: {
          50: "#e6f0ff",
          100: "#cce1ff",
          200: "#99c2ff",
          400: "#338cff",
          500: "#006bff",
          600: "#0056cc",
          700: "#004099",
        },
        slate: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b6b6b",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
        },
        sky: {
          300: "#7DD3FC",
          400: "#38BDF8",
          500: "#0EA5E9",
        },
      },
    },
  },
  plugins: [],
};
