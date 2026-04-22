/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          deep: "#020C2A",
          dark: "#081A44",
          mid: "#0E2A63",
          electricBlue: "#2F7BFF",
          neonBlue: "#4FA6FF",
          neonCyan: "#8CEBFF",
          vividPurple: "#6B4DFF",
          neonPurple: "#8C5BFF",
          magentaGlow: "#FF5EDB",
        },
      },
      boxShadow: {
        tealGlow:
          "0 0 22px rgba(140,235,255,0.14), 0 14px 38px rgba(3,10,28,0.42)",
        purpleGlow:
          "0 0 22px rgba(140,91,255,0.14), 0 14px 38px rgba(3,10,28,0.42)",
        glass:
          "0 0 0 1px rgba(140,235,255,0.08) inset, 0 14px 38px rgba(3,10,28,0.42)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};