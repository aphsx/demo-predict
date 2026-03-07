/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#dce6ff",
          500: "#4f7cff",
          600: "#3a63f5",
          700: "#2b4fd6",
          900: "#1a2f7a",
        },
      },
    },
  },
  plugins: [],
};
