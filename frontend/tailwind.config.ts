import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          950: '#0f1f3d',
          900: '#1e3a8a',
          800: '#2348a0',
          700: '#2d5bc4',
          600: '#3d6fd0',
          50: '#eff6ff',
        },
        gold: {
          700: '#7a5a18',
          600: '#9a7020',
          500: '#b8882e',
          400: '#d4a843',
          300: '#e8c464',
          200: '#f5dfa0',
          100: '#faf0d0',
          50: '#fdf9ee',
        },
        cream: {
          50: '#fdfcf8',
          100: '#f8f4ec',
          200: '#ede6d8',
          300: '#dfd5c4',
          400: '#c8bba4',
        },
      },
      boxShadow: {
        'warm-xs': '0 1px 4px rgba(30,58,138,0.06)',
        'warm-sm': '0 2px 8px rgba(30,58,138,0.08)',
        'warm':    '0 4px 16px rgba(30,58,138,0.10)',
        'warm-md': '0 8px 30px rgba(30,58,138,0.13)',
        'warm-lg': '0 16px 48px rgba(30,58,138,0.18)',
      },
    },
  },
  plugins: [],
}
export default config
