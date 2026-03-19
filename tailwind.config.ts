import type { Config } from 'tailwindcss';

/*
 * Anthropic Authentic Warm Color System
 *
 * All default Tailwind color scales are remapped to warm Anthropic equivalents:
 * - blue/indigo/violet/purple → terracotta/Anthropic blue range
 * - slate/zinc/gray → warm stone/neutral grays
 * - green/emerald/teal → earthy greens
 * - sky/cyan → Anthropic blue accent
 */

// Anthropic warm neutral scale (replaces cold slate/zinc/gray)
const warmNeutral = {
  50: '#faf9f5',    // Warm cream
  100: '#f4f3ee',   // Pampas
  200: '#e8e6dc',   // Light warm gray
  300: '#d6d3c8',   // Mid-light
  400: '#b0aea5',   // Cloudy (Anthropic mid gray)
  500: '#8a8880',
  600: '#6b6963',
  700: '#4a4a46',
  800: '#2d2d2a',
  900: '#141413',   // Anthropic dark
  950: '#0a0a09',
};

// Anthropic terracotta scale (replaces blue/indigo as primary action color)
const terracotta = {
  50: '#fdf5f2',
  100: '#faf0ec',
  200: '#f5ddd4',
  300: '#ecc4b5',
  400: '#e6957a',
  500: '#d97757',   // Anthropic primary
  600: '#c15f3c',   // Crail
  700: '#a34e32',
  800: '#8b4513',
  900: '#6d3610',
  950: '#3d1e09',
};

// Anthropic blue scale (replaces sky/cyan as secondary accent)
const anthropicBlue = {
  50: '#edf3f8',
  100: '#dce8f3',
  200: '#b8cfe4',
  300: '#8bb4d9',
  400: '#6a9bcc',   // Anthropic blue
  500: '#5585b3',
  600: '#4a7399',
  700: '#3d5f7e',
  800: '#324d66',
  900: '#2a3f54',
  950: '#1a2a38',
};

// Anthropic earthy green scale (replaces green/emerald/teal)
const earthyGreen = {
  50: '#f0f4ec',
  100: '#e4ebd8',
  200: '#c4d6b3',
  300: '#a8bf8f',
  400: '#92a87a',
  500: '#788c5d',   // Anthropic green
  600: '#647746',
  700: '#526338',
  800: '#434f2e',
  900: '#374028',
  950: '#1d2214',
};

export default {
  darkMode: ['class'],
  content: ['./client/index.html', './client/src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    // Override default color palette with Anthropic warm equivalents
    colors: {
      // Preserve essential utilities
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      black: '#141413',
      white: '#ffffff',

      // All neutral grays → warm stone
      slate: warmNeutral,
      gray: warmNeutral,
      zinc: warmNeutral,
      neutral: warmNeutral,
      stone: warmNeutral,

      // Blues/indigo/violet/purple → terracotta (primary brand)
      blue: terracotta,
      indigo: terracotta,
      violet: anthropicBlue,
      purple: anthropicBlue,

      // Sky/cyan → Anthropic blue (secondary accent)
      sky: anthropicBlue,
      cyan: anthropicBlue,

      // Greens → earthy green
      green: earthyGreen,
      emerald: earthyGreen,
      teal: earthyGreen,

      // Warm colors stay warm (minimal changes)
      red: {
        50: '#fef2f2',
        100: '#fee2e2',
        200: '#fecaca',
        300: '#fca5a5',
        400: '#f87171',
        500: '#ef4444',
        600: '#dc2626',
        700: '#b91c1c',
        800: '#991b1b',
        900: '#7f1d1d',
        950: '#450a0a',
      },
      orange: {
        50: '#fff7ed',
        100: '#ffedd5',
        200: '#fed7aa',
        300: '#fdba74',
        400: '#fb923c',
        500: '#f97316',
        600: '#ea580c',
        700: '#c2410c',
        800: '#9a3412',
        900: '#7c2d12',
        950: '#431407',
      },
      amber: {
        50: '#fffbeb',
        100: '#fef3c7',
        200: '#fde68a',
        300: '#fcd34d',
        400: '#fbbf24',
        500: '#f59e0b',
        600: '#d97706',
        700: '#b45309',
        800: '#92400e',
        900: '#78350f',
        950: '#451a03',
      },
      yellow: {
        50: '#fefce8',
        100: '#fef9c3',
        200: '#fef08a',
        300: '#fde047',
        400: '#facc15',
        500: '#eab308',
        600: '#ca8a04',
        700: '#a16207',
        800: '#854d0e',
        900: '#713f12',
        950: '#422006',
      },
      lime: earthyGreen,
      rose: {
        50: '#fff1f2',
        100: '#ffe4e6',
        200: '#fecdd3',
        300: '#fda4af',
        400: '#fb7185',
        500: '#f43f5e',
        600: '#e11d48',
        700: '#be123c',
        800: '#9f1239',
        900: '#881337',
        950: '#4c0519',
      },
      pink: {
        50: '#fdf5f2',
        100: '#faf0ec',
        200: '#f5ddd4',
        300: '#ecc4b5',
        400: '#e6957a',
        500: '#d97757',  // Reuses terracotta for pink
        600: '#c15f3c',
        700: '#a34e32',
        800: '#8b4513',
        900: '#6d3610',
        950: '#3d1e09',
      },
      fuchsia: anthropicBlue,
    },
    extend: {
      // shadcn/ui semantic tokens + data visualization colors
      colors: {
        // Data visualization colors — true semantic colors for charts, heatmaps, severity indicators
        // These are NOT overridden — use these for Recharts, D3, and any data viz
        'chart-blue': { DEFAULT: '#3b82f6', light: '#93c5fd', dark: '#1d4ed8' },
        'chart-green': { DEFAULT: '#22c55e', light: '#86efac', dark: '#15803d' },
        'chart-red': { DEFAULT: '#ef4444', light: '#fca5a5', dark: '#b91c1c' },
        'chart-yellow': { DEFAULT: '#eab308', light: '#fde047', dark: '#a16207' },
        'chart-purple': { DEFAULT: '#a855f7', light: '#d8b4fe', dark: '#7e22ce' },
        'chart-cyan': { DEFAULT: '#06b6d4', light: '#67e8f9', dark: '#0e7490' },
        'chart-orange': { DEFAULT: '#f97316', light: '#fdba74', dark: '#c2410c' },
        'chart-pink': { DEFAULT: '#ec4899', light: '#f9a8d4', dark: '#be185d' },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        heading: ['Poppins', 'Arial', 'sans-serif'],
        body: ['Lora', 'Georgia', 'serif'],
        ui: ['Poppins', 'Arial', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down var(--motion-duration-normal) var(--motion-ease-standard)',
        'accordion-up': 'accordion-up var(--motion-duration-normal) var(--motion-ease-standard)',
      },
      transitionDuration: {
        fast: 'var(--motion-duration-fast)',
        normal: 'var(--motion-duration-normal)',
        slow: 'var(--motion-duration-slow)',
        slower: 'var(--motion-duration-slower)',
      },
      transitionTimingFunction: {
        standard: 'var(--motion-ease-standard)',
        emphasize: 'var(--motion-ease-emphasize)',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config;
