/**
 * Concept2Cure Design System - Design Tokens
 *
 * Core design tokens that define the visual language of the platform.
 * These tokens are the single source of truth for all visual properties.
 *
 * Inspired by the calm, professional aesthetic of Claude.AI and Gemini.
 *
 * @version 3.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Semantic color palette with purpose-driven naming
 */
export const colors = {
  // ─────────────────────────────────────────────────────────────────────────────
  // NEUTRALS - The foundation of the visual hierarchy
  // ─────────────────────────────────────────────────────────────────────────────
  neutral: {
    0: '#FFFFFF',
    50: '#FAFAFA',
    100: '#F5F5F5',
    150: '#EDEDED',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIMARY - Trusted, professional blue (like Claude's accent)
  // ─────────────────────────────────────────────────────────────────────────────
  primary: {
    50: '#EEF4FF',
    100: '#E0EBFF',
    200: '#C6D9FF',
    300: '#A3BFFF',
    400: '#7A9DFF',
    500: '#5B7CF7',
    600: '#4361EE', // Main brand color
    700: '#3651D9',
    800: '#2D44AF',
    900: '#2A3D8A',
    950: '#1B2654',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SUCCESS - Calm, confident green
  // ─────────────────────────────────────────────────────────────────────────────
  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669', // Primary success
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
    950: '#022C22',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // WARNING - Warm amber for attention
  // ─────────────────────────────────────────────────────────────────────────────
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706', // Primary warning
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    950: '#451A03',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR - Soft but clear red
  // ─────────────────────────────────────────────────────────────────────────────
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626', // Primary error
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // INFO - Soft cyan for informational elements
  // ─────────────────────────────────────────────────────────────────────────────
  info: {
    50: '#ECFEFF',
    100: '#CFFAFE',
    200: '#A5F3FC',
    300: '#67E8F9',
    400: '#22D3EE',
    500: '#06B6D4',
    600: '#0891B2', // Primary info
    700: '#0E7490',
    800: '#155E75',
    900: '#164E63',
    950: '#083344',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ACCENT - Purple for AI/Intelligence features (like Gemini)
  // ─────────────────────────────────────────────────────────────────────────────
  accent: {
    50: '#F5F3FF',
    100: '#EDE9FE',
    200: '#DDD6FE',
    300: '#C4B5FD',
    400: '#A78BFA',
    500: '#78716c',
    600: '#57534e', // AI accent — stone-600
    700: '#6D28D9',
    800: '#5B21B6',
    900: '#4C1D95',
    950: '#2E1065',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Typography scale based on a 1.25 ratio for clear hierarchy
 */
export const typography = {
  // Font families
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
    display: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },

  // Font sizes with line heights
  fontSize: {
    '2xs': ['0.625rem', { lineHeight: '0.875rem' }], // 10px
    xs: ['0.75rem', { lineHeight: '1rem' }], // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }], // 14px
    base: ['1rem', { lineHeight: '1.5rem' }], // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }], // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }], // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }], // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36px
    '5xl': ['3rem', { lineHeight: '1' }], // 48px
    '6xl': ['3.75rem', { lineHeight: '1' }], // 60px
  },

  // Font weights
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SPACING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Spacing scale based on 4px grid
 */
export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem', // 2px
  1: '0.25rem', // 4px
  1.5: '0.375rem', // 6px
  2: '0.5rem', // 8px
  2.5: '0.625rem', // 10px
  3: '0.75rem', // 12px
  3.5: '0.875rem', // 14px
  4: '1rem', // 16px
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  7: '1.75rem', // 28px
  8: '2rem', // 32px
  9: '2.25rem', // 36px
  10: '2.5rem', // 40px
  11: '2.75rem', // 44px
  12: '3rem', // 48px
  14: '3.5rem', // 56px
  16: '4rem', // 64px
  20: '5rem', // 80px
  24: '6rem', // 96px
  28: '7rem', // 112px
  32: '8rem', // 128px
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// BORDER RADIUS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Border radius scale for consistent rounding
 */
export const borderRadius = {
  none: '0',
  sm: '0.25rem', // 4px
  DEFAULT: '0.5rem', // 8px
  md: '0.5rem', // 8px
  lg: '0.75rem', // 12px
  xl: '1rem', // 16px
  '2xl': '1.25rem', // 20px
  '3xl': '1.5rem', // 24px
  full: '9999px',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SHADOWS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shadow scale for depth and elevation
 * Softer shadows for a more elegant feel
 */
export const shadows = {
  none: 'none',
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.03)',
  sm: '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
  DEFAULT: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.05), 0 8px 10px -6px rgb(0 0 0 / 0.05)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.15)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.03)',
  // Colored shadows for interactive elements
  primary: '0 4px 14px 0 rgb(67 97 238 / 0.25)',
  success: '0 4px 14px 0 rgb(5 150 105 / 0.25)',
  error: '0 4px 14px 0 rgb(220 38 38 / 0.25)',
  accent: '0 4px 14px 0 rgb(124 58 237 / 0.25)',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transition presets for consistent animations
 */
export const transitions = {
  // Durations
  duration: {
    instant: '0ms',
    fast: '100ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Timing functions (easing)
  easing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    // Apple-like spring curves
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  // Common transition presets
  preset: {
    fast: 'all 100ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    color: 'color 200ms ease, background-color 200ms ease, border-color 200ms ease',
    transform: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: 'opacity 200ms ease',
    shadow: 'box-shadow 200ms ease',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Z-INDEX
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Z-index scale for stacking context management
 */
export const zIndex = {
  hide: -1,
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  skipLink: 1600,
  toast: 1700,
  tooltip: 1800,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// BREAKPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Responsive breakpoints
 */
export const breakpoints = {
  xs: '475px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SEMANTIC TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Semantic tokens for component styling
 * These map design tokens to specific use cases
 */
export const semantic = {
  // Background colors
  bg: {
    page: colors.neutral[50],
    surface: colors.neutral[0],
    surfaceRaised: colors.neutral[0],
    surfaceSunken: colors.neutral[100],
    muted: colors.neutral[100],
    subtle: colors.neutral[50],
    inverse: colors.neutral[900],
  },

  // Text colors
  text: {
    primary: colors.neutral[900],
    secondary: colors.neutral[600],
    tertiary: colors.neutral[500],
    muted: colors.neutral[400],
    inverse: colors.neutral[0],
    link: colors.primary[600],
    linkHover: colors.primary[700],
  },

  // Border colors
  border: {
    default: colors.neutral[200],
    muted: colors.neutral[150],
    strong: colors.neutral[300],
    focus: colors.primary[500],
    error: colors.error[500],
  },

  // Interactive states
  interactive: {
    default: colors.primary[600],
    hover: colors.primary[700],
    active: colors.primary[800],
    disabled: colors.neutral[300],
    focus: colors.primary[500],
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type ColorScale = typeof colors;
export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type Shadows = typeof shadows;
export type Transitions = typeof transitions;
export type ZIndex = typeof zIndex;
export type Breakpoints = typeof breakpoints;
export type SemanticTokens = typeof semantic;
