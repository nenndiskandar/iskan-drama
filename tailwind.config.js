/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./views/**/*.ejs", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
        // Pocket skin dark-accent colors
        pocket: {
          bg: "#0f1117",
          card: "#171a21",
          accent: "#ff3e6a",
          "accent-hover": "#ff1e4d",
          "text-primary": "#e5e7eb",
          "text-secondary": "#9ca3af",
          border: "#2a2f3a",
        },
      },
      fontFamily: {
        body: ["Inter", "ui-sans", "system-ui", "sans-serif"],
        mono: ["Fira Code", "monospace"],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
