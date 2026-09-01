/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js"],
  safelist: ["aspect-[2/3]", "aspect-[3/4]", "aspect-video"],
  theme: {
    extend: {
      colors: {
        slate: {
          850: "#131c2e",
          950: "#0b0f19",
        },
        transmit: {
          bg: "#0b0f19",
          card: "#151d2a",
          cardBorder: "#222f43",
          accent: "#8b5cf6", // violet-500
          accentHover: "#7c3aed",
          accentLight: "#a78bfa",
          pink: "#ec4899",
        },
      },
      fontFamily: {
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Fira Code", "monospace"],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
