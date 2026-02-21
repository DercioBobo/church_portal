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
        // "navy" repurposed as neutral dark — no blue
        navy: {
          950: '#030712',
          900: '#111827',
          800: '#1f2937',
          700: '#374151',
          600: '#4b5563',
          50:  '#f9fafb',
        },
        gold: {
          700: '#7a5a18',
          600: '#9a7020',
          500: '#b8882e',
          400: '#d4a843',
          300: '#e8c464',
          200: '#f5dfa0',
          100: '#fef9ec',
          50:  '#fffdf5',
        },
        // "cream" repurposed as clean neutral grays
        cream: {
          50:  '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
        },
      },
      boxShadow: {
        'warm-xs': '0 1px 3px rgba(0,0,0,0.06)',
        'warm-sm': '0 2px 8px rgba(0,0,0,0.08)',
        'warm':    '0 4px 16px rgba(0,0,0,0.08)',
        'warm-md': '0 8px 28px rgba(0,0,0,0.10)',
        'warm-lg': '0 16px 48px rgba(0,0,0,0.14)',
      },
    },
  },
  plugins: [],
}
export default config
