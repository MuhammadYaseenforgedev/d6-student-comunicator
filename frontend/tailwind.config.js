/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          sky1: "#4EC2F3",
          sky2: "#49BCF3",
          aqua1: "#7EF3E3",
          aqua2: "#70ECE4",
          purple1: "#794DFA",
          purple2: "#6C44FD",
          bg: "#F2F3F5",
          soft: "#E5E7EB",
          border: "#DADDE2",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,23,42,0.04), 0 12px 30px rgba(15,23,42,0.05)",
        softLg: "0 2px 8px rgba(15,23,42,0.05), 0 16px 40px rgba(15,23,42,0.07)",
        softXl: "0 4px 16px rgba(15,23,42,0.06), 0 22px 50px rgba(15,23,42,0.08)",
        primaryBtn: "0 8px 20px rgba(121,77,250,0.10), 0 1px 2px rgba(15,23,42,0.06)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};