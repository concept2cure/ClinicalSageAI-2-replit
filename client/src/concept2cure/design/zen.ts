/**
 * @fileoverview Concept2Cure Zen Design System
 * @module concept2cure/design/zen
 * @version 3.0.0
 *
 * @description
 * Minimalist design system inspired by Claude.ai, ChatGPT, and Apple's design philosophy.
 * The "New iPhone Analogy" for life science regulatory intelligence.
 *
 * Design Principles:
 * 1. CLARITY - Remove visual noise, every element earns its place
 * 2. DEFERENCE - Content is king, UI fades into the background
 * 3. DEPTH - Subtle layering creates natural hierarchy
 * 4. BREATHING ROOM - Generous whitespace, unhurried layouts
 * 5. INTENTIONAL MOTION - Smooth, purposeful animations
 *
 * @compliance
 * - WCAG 2.1 AA accessible color contrast
 * - FDA 21 CFR Part 11 audit trails preserved
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Minimal color palette - fewer colors, more meaning
 * Inspired by Claude.ai's warm neutrals and ChatGPT's clean aesthetic
 */
export const zenColors = {
  // ─────────────────────────────────────────────────────────────────────────────
  // CANVAS - The foundation, like Claude.ai's warm white
  // ─────────────────────────────────────────────────────────────────────────────
  canvas: {
    DEFAULT: '#FAFAF9',     // Warm white - main background (Claude.ai)
    muted: '#F5F5F4',       // Subtle differentiation
    elevated: '#FFFFFF',    // Cards, modals
    inverse: '#18181B',     // Dark surfaces
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // INK - Text colors with clear hierarchy
  // ─────────────────────────────────────────────────────────────────────────────
  ink: {
    DEFAULT: '#18181B',     // Primary text - zinc-900
    muted: '#71717A',       // Secondary text - zinc-500
    subtle: '#A1A1AA',      // Tertiary text - zinc-400
    disabled: '#D4D4D8',    // Disabled state - zinc-300
    inverse: '#FAFAFA',     // Text on dark
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ACCENT - Single brand color family (like Claude's orange-brown)
  // ─────────────────────────────────────────────────────────────────────────────
  accent: {
    DEFAULT: '#2563EB',     // Primary action blue - clean, professional
    hover: '#1D4ED8',       // Hover state
    muted: '#DBEAFE',       // Light background tint
    subtle: '#EFF6FF',      // Very light tint
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // AI - Special color for Lumen AI persona (like Claude's warm tones)
  // ─────────────────────────────────────────────────────────────────────────────
  ai: {
    DEFAULT: '#8B5CF6',     // Violet - AI/assistant identity
    hover: '#7C3AED',
    muted: '#EDE9FE',
    glow: 'rgba(139, 92, 246, 0.1)',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SEMANTIC - Status colors (used sparingly)
  // ─────────────────────────────────────────────────────────────────────────────
  status: {
    success: '#059669',     // Emerald-600
    successMuted: '#D1FAE5',
    warning: '#D97706',     // Amber-600
    warningMuted: '#FEF3C7',
    error: '#DC2626',       // Red-600
    errorMuted: '#FEE2E2',
    info: '#0284C7',        // Sky-600
    infoMuted: '#E0F2FE',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BORDER - Minimal, purposeful borders
  // ─────────────────────────────────────────────────────────────────────────────
  border: {
    DEFAULT: '#E4E4E7',     // Standard border - zinc-200
    subtle: '#F4F4F5',      // Very light border - zinc-100
    focus: '#2563EB',       // Focus ring
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN SPACING SCALE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generous spacing for breathing room - Claude.ai-style
 */
export const zenSpacing = {
  0: '0',
  px: '1px',
  0.5: '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN TYPOGRAPHY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clean, readable typography with system fonts
 */
export const zenTypography = {
  // Font families - system fonts for performance and native feel
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
  },

  // Font sizes - purposeful scale
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],       // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],   // 14px
    base: ['1rem', { lineHeight: '1.5rem' }],      // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }],   // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],    // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],     // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],// 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],  // 36px
  },

  // Font weights
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
  },

  // Letter spacing
  letterSpacing: {
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN SHADOWS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Subtle, layered shadows for depth without heaviness
 */
export const zenShadows = {
  none: 'none',
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.03)',
  sm: '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.05), 0 8px 10px -6px rgb(0 0 0 / 0.05)',
  glow: '0 0 20px rgb(37 99 235 / 0.1)', // Focus glow
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN BORDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Consistent border radii - rounded but not childish
 */
export const zenBorderRadius = {
  none: '0',
  sm: '0.375rem',   // 6px - small elements
  md: '0.5rem',     // 8px - buttons, inputs
  lg: '0.75rem',    // 12px - cards
  xl: '1rem',       // 16px - modals, large cards
  '2xl': '1.5rem',  // 24px - hero elements
  full: '9999px',   // Pills, avatars
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Smooth, natural motion - never jarring
 */
export const zenTransitions = {
  duration: {
    instant: '0ms',
    fast: '100ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },
  timing: {
    linear: 'linear',
    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',        // Natural ease
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)', // Playful bounce
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN LAYOUT CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Layout dimensions inspired by Claude.ai and ChatGPT
 */
export const zenLayout = {
  // Sidebar
  sidebar: {
    collapsed: '60px',
    expanded: '260px',
    maxWidth: '320px',
  },

  // Content
  content: {
    maxWidth: '768px',      // Claude.ai-style narrow content
    wideMaxWidth: '1024px', // For tables/artifacts
    fullWidth: '100%',
  },

  // Input area
  input: {
    maxWidth: '768px',
    minHeight: '52px',
    maxHeight: '200px',
  },

  // Header
  header: {
    height: '48px',
    mobileHeight: '56px',
  },

  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN COMPONENT VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pre-defined component styles
 */
export const zenComponents = {
  // Button variants
  button: {
    primary: {
      background: zenColors.accent.DEFAULT,
      color: zenColors.canvas.elevated,
      hoverBackground: zenColors.accent.hover,
      border: 'none',
      shadow: zenShadows.sm,
    },
    secondary: {
      background: zenColors.canvas.elevated,
      color: zenColors.ink.DEFAULT,
      hoverBackground: zenColors.canvas.muted,
      border: `1px solid ${zenColors.border.DEFAULT}`,
      shadow: 'none',
    },
    ghost: {
      background: 'transparent',
      color: zenColors.ink.muted,
      hoverBackground: zenColors.canvas.muted,
      border: 'none',
      shadow: 'none',
    },
  },

  // Card variants
  card: {
    default: {
      background: zenColors.canvas.elevated,
      border: `1px solid ${zenColors.border.subtle}`,
      borderRadius: zenBorderRadius.lg,
      shadow: zenShadows.sm,
    },
    elevated: {
      background: zenColors.canvas.elevated,
      border: 'none',
      borderRadius: zenBorderRadius.lg,
      shadow: zenShadows.md,
    },
    outline: {
      background: 'transparent',
      border: `1px solid ${zenColors.border.DEFAULT}`,
      borderRadius: zenBorderRadius.lg,
      shadow: 'none',
    },
  },

  // Input variants
  input: {
    default: {
      background: zenColors.canvas.elevated,
      border: `1px solid ${zenColors.border.DEFAULT}`,
      borderRadius: zenBorderRadius.md,
      focusBorder: zenColors.border.focus,
      focusRing: `0 0 0 3px ${zenColors.accent.subtle}`,
    },
    ghost: {
      background: 'transparent',
      border: 'none',
      borderRadius: zenBorderRadius.md,
      focusBorder: 'none',
      focusRing: 'none',
    },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN CSS CLASSES (Tailwind-compatible)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Common class combinations for consistent styling
 */
export const zenClasses = {
  // Layout
  container: 'mx-auto max-w-3xl px-4 sm:px-6',
  containerWide: 'mx-auto max-w-5xl px-4 sm:px-6',
  centerContent: 'flex items-center justify-center',

  // Text
  heading1: 'text-2xl font-semibold tracking-tight text-zinc-900',
  heading2: 'text-xl font-semibold tracking-tight text-zinc-900',
  heading3: 'text-lg font-medium text-zinc-900',
  body: 'text-base text-zinc-700 leading-relaxed',
  caption: 'text-sm text-zinc-500',
  label: 'text-sm font-medium text-zinc-700',

  // Interactive
  buttonBase: 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  buttonPrimary: 'bg-blue-600 text-white hover:bg-blue-700 px-4 py-2',
  buttonSecondary: 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 px-4 py-2',
  buttonGhost: 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 px-3 py-2',
  buttonIcon: 'p-2 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg',

  // Cards
  card: 'bg-white rounded-xl border border-zinc-100 shadow-sm',
  cardHover: 'bg-white rounded-xl border border-zinc-100 shadow-sm hover:shadow-md hover:border-zinc-200 transition-all cursor-pointer',

  // Input
  input: 'w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors',
  textarea: 'w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors resize-none',

  // States
  focusRing: 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
  hoverLight: 'hover:bg-zinc-50 transition-colors',
  hoverDark: 'hover:bg-zinc-100 transition-colors',
  active: 'bg-blue-50 text-blue-700 border-blue-200',

  // Animation
  fadeIn: 'animate-in fade-in duration-200',
  slideUp: 'animate-in slide-in-from-bottom-4 duration-300',
  scaleIn: 'animate-in zoom-in-95 duration-200',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN THEME EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const zenTheme = {
  colors: zenColors,
  spacing: zenSpacing,
  typography: zenTypography,
  shadows: zenShadows,
  borderRadius: zenBorderRadius,
  transitions: zenTransitions,
  layout: zenLayout,
  components: zenComponents,
  classes: zenClasses,
} as const;

export type ZenTheme = typeof zenTheme;
export type ZenColors = typeof zenColors;
export type ZenSpacing = typeof zenSpacing;
