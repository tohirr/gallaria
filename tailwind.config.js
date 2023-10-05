/** @type {import('tailwindcss').Config} */
/*eslint-env node*/
module.exports = {
  content: ["./src/**/*.{html,js,jsx}"],
  theme: {
    extend: {
      gridTemplateRows: {
        100: "repeat(100, minmax(0, 10px))",
      },
    },
  },
  plugins: [],
};
