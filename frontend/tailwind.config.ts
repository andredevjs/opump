import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        card: '#12121a',
        elevated: '#1a1a27',
        input: '#242436',
        border: '#2a2a3d',
        'text-primary': '#e4e4ed',
        'text-secondary': '#8888a0',
        'text-muted': '#55556a',
        accent: '#f5c518',
        'accent-hover': '#d4a910',
        bull: '#22c55e',
        bear: '#ef4444',
        pending: '#f5c518',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
