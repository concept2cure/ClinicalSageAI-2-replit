/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './client/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hotpink: {
          50: 'var(--color-hotpink-50)',
          100: 'var(--color-hotpink-100)',
          200: 'var(--color-hotpink-200)',
          300: 'var(--color-hotpink-300)',
          400: 'var(--color-hotpink-400)',
          500: 'var(--color-hotpink-500)',
          600: 'var(--color-hotpink-600)',
          700: 'var(--color-hotpink-700)',
          800: 'var(--color-hotpink-800)',
          900: 'var(--color-hotpink-900)',
          950: 'var(--color-hotpink-950)',
        },
      },
    },
  },
  plugins: [],
};
