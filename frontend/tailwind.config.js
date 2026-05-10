/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#e5e7eb',
          300: '#9ca3af',
          400: '#6b7280',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#1f2937',
          900: '#111827',
        },
      },
    },
  },
  plugins: [],
};
