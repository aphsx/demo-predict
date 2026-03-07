/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#060D24",
          900: "#0B1937",
          800: "#0E2155",
          700: "#1A3068",
          600: "#2A4585",
        },
        brand: {
          50:  "#EEF4FF",
          100: "#D9E8FF",
          200: "#B3CFFF",
          400: "#5B8FFF",
          500: "#2B72FF",
          600: "#1461F0",
          700: "#0E4EC0",
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
