/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111313",
        panel: "#191c1b",
        accent: "#b8f36b",
      },
    },
  },
  plugins: [],
};
