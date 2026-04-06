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
    DEFAULT: '#18181B',     // Primary text - stone-900
    muted: '#71717A',       // Secondary text - stone-500
    subtle: '#A1A1AA',      // Tertiary text - stone-400
    disabled: '#D4D4D8',    // Disabled state - stone-300
    inverse: '#FAFAFA',     // Text on dark
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ACCENT - Single brand color family (like Claude's orange-brown)
  // ─────────────────────────────────────────────────────────────────────────────
  accent: {
    DEFAULT: '#5585b3',     // Primary action - restrained Anthropic blue
    hover: '#4a7399',       // Hover state
    muted: '#dce8f3',       // Light blue background tint
    subtle: '#edf3f8',      // Very light blue tint
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // AI - Special color for AnA AI persona (like Claude's warm tones)
  // ─────────────────────────────────────────────────────────────────────────────
  ai: {
    DEFAULT: '#6a9bcc',     // Violet - AI/assistant identity
    hover: '#5585b3',
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
    DEFAULT: '#E4E4E7',     // Standard border - stone-200
    subtle: '#F4F4F5',      // Very light border - stone-100
    focus: '#5585b3',       // Focus ring
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
  glow: '0 0 20px rgb(85 133 179 / 0.1)', // Focus glow (blue accent)
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
    fast: '120ms',
    normal: '180ms',
    slow: '240ms',
    slower: '360ms',
  },
  timing: {
    linear: 'linear',
    ease: 'cubic-bezier(0.2, 0, 0, 1)',        // Subtle, calm default
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0.2, 0, 0, 1)',
    easeInOut: 'cubic-bezier(0.2, 0, 0, 1)',
    spring: 'cubic-bezier(0.16, 1, 0.3, 1)', // Expressive but controlled
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL MOTION PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Single motion profile applied across all modules/shells.
 * - Subtle by default
 * - Expressive only for onboarding/first-run moments
 * - Client-specific variation: density/scale only (not timing/easing)
 */
export const zenMotionProfile = {
  durationMs: {
    fast: 120,
    normal: 180,
    slow: 240,
    slower: 360,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasize: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  distance: {
    xs: '4px',
    sm: '8px',
    md: '12px',
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
  // ─── Layout ──────────────────────────────────────────────────────────────────
  container: 'mx-auto max-w-3xl px-4 sm:px-6',
  containerWide: 'mx-auto max-w-5xl px-4 sm:px-6',
  centerContent: 'flex items-center justify-center',

  // ─── Typography Hierarchy ────────────────────────────────────────────────────
  // RULE: Always use these — never ad-hoc font-size + weight combos
  heading1: 'text-lg font-semibold tracking-tight text-stone-900',
  heading2: 'text-lg font-semibold text-stone-900',
  heading3: 'text-base font-semibold text-stone-900',
  heading4: 'text-sm font-medium text-stone-700',
  body: 'text-sm text-stone-600 leading-relaxed',
  bodyLg: 'text-base text-stone-600 leading-relaxed',
  caption: 'text-xs text-stone-500',
  label: 'text-sm font-medium text-stone-700',
  meta: 'text-xs text-stone-500',
  overline: 'text-xs font-medium text-stone-400 uppercase tracking-wider',

  // ─── Interactive ─────────────────────────────────────────────────────────────
  // RULE: All buttons use buttonBase + a variant. Never build buttons from scratch.
  buttonBase: 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none disabled:opacity-50 disabled:pointer-events-none',
  buttonPrimary: 'bg-stone-800 text-white hover:bg-stone-900 shadow-sm px-4 py-2 text-sm',
  buttonSecondary: 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-300 px-4 py-2 text-sm',
  buttonGhost: 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-2 text-sm',
  buttonDanger: 'bg-stone-700 text-white hover:bg-stone-800 shadow-sm px-4 py-2 text-sm',
  buttonSuccess: 'bg-stone-700 text-white hover:bg-stone-800 shadow-sm px-4 py-2 text-sm',
  buttonWarning: 'bg-stone-900 text-white hover:bg-stone-600 shadow-sm px-4 py-2 text-sm',
  buttonIcon: 'p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg',
  // Size modifiers (combine with variant)
  buttonSm: 'px-3 py-1.5 text-xs gap-1.5',
  buttonLg: 'px-5 py-2.5 text-sm gap-2',

  // ─── Cards ───────────────────────────────────────────────────────────────────
  // RULE: rounded-xl, border-stone-200, shadow-sm. Never rounded-2xl or border-2.
  card: 'bg-white rounded-xl border border-stone-200 shadow-sm',
  cardHover: 'bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-sm hover:border-stone-300 transition-all duration-150 cursor-pointer',
  cardPadding: 'p-5',
  cardSection: 'px-5 py-4 border-t border-stone-100',
  cardSectionMuted: 'px-5 py-4 border-t border-stone-100 bg-stone-50',

  // ─── Icon Boxes ──────────────────────────────────────────────────────────────
  // RULE: 3 sizes only. rounded-md (sm), rounded-lg (md, lg). Never rounded-xl.
  iconBoxSm: 'w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0',
  iconBoxMd: 'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
  iconBoxLg: 'w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0',

  // ─── Status Pills ───────────────────────────────────────────────────────────
  // RULE: All badges use this base + a color combo
  pillBase: 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',

  // ─── Input ───────────────────────────────────────────────────────────────────
  input: 'w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-400/20 focus:outline-none transition-colors duration-150',
  textarea: 'w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-400/20 focus:outline-none transition-colors duration-150 resize-none',

  // ─── States ──────────────────────────────────────────────────────────────────
  focusRing: 'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
  hoverLight: 'hover:bg-stone-50 transition-colors duration-150',
  hoverDark: 'hover:bg-stone-100 transition-colors duration-150',
  active: 'bg-stone-100 text-stone-900 border-stone-300',

  // ─── Animation ───────────────────────────────────────────────────────────────
  fadeIn: 'animate-in fade-in duration-200',
  slideUp: 'animate-in slide-in-from-bottom-4 duration-300',
  scaleIn: 'animate-in zoom-in-95 duration-200',

  // ─── Dividers ────────────────────────────────────────────────────────────────
  divider: 'h-px bg-stone-100',
  dividerStrong: 'h-px bg-stone-200',
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
