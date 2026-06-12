/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#10B981', // Emerald-500
          dark: '#059669', // Emerald-600
          light: '#34D399', // Emerald-400
        }
      }
    },
  },
  plugins: [],
}
