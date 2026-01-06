/** @type {import('tailwindcss').Config} */
const path = require('path')

module.exports = {
  content: [
    path.resolve(__dirname, './client/**/*.{vue,js,ts,jsx,tsx}'),
    path.resolve(__dirname, './client/**/*.vue'),
    path.resolve(__dirname, './client/**/*.ts'),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  important: true,
}
