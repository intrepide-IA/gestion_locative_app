/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3B82F6",
        background: "#F9FAFB",
        alert: "#EF4444",
      },
    },
  },
  plugins: [],
}
