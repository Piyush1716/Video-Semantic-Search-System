/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f5f5f5",
        foreground: "#1f2937",
        border: "#e5e7eb",
      },
    },
  },
  plugins: [],
};
