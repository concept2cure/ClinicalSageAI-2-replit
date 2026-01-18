/**
 * CERv2 Design System
 * 
 * Design tokens and utilities for consistent spacing, typography, and colors
 * across the CERv2 Workbench UI.
 * 
 * Usage:
 * import { spacing, typography, colors, shadows } from '@/styles/designSystem';
 */

export const spacing = {
  xs: '0.25rem',  // 4px
  sm: '0.5rem',   // 8px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
  '3xl': '4rem',  // 64px
};

export const typography = {
  heading: {
    large: 'text-2xl font-bold text-slate-900',
    medium: 'text-xl font-semibold text-slate-900',
    small: 'text-lg font-semibold text-slate-900',
  },
  body: {
    large: 'text-base text-slate-700',
    medium: 'text-sm text-slate-600',
    small: 'text-xs text-slate-500',
  },
  label: {
    large: 'text-sm font-medium text-slate-700',
    medium: 'text-xs font-semibold text-slate-600',
    small: 'text-[11px] font-semibold text-slate-500 uppercase tracking-wide',
  },
  code: 'font-mono text-xs text-slate-800',
};

export const colors = {
  primary: {
    50: 'indigo-50',
    100: 'indigo-100',
    500: 'indigo-500',
    600: 'indigo-600',
    700: 'indigo-700',
  },
  success: {
    50: 'green-50',
    100: 'green-100',
    500: 'green-500',
    600: 'green-600',
  },
  warning: {
    50: 'amber-50',
    100: 'amber-100',
    500: 'amber-500',
    600: 'amber-600',
  },
  danger: {
    50: 'rose-50',
    100: 'rose-100',
    500: 'rose-500',
    600: 'rose-600',
  },
  neutral: {
    50: 'slate-50',
    100: 'slate-100',
    200: 'slate-200',
    300: 'slate-300',
    400: 'slate-400',
    500: 'slate-500',
    600: 'slate-600',
    700: 'slate-700',
    800: 'slate-800',
    900: 'slate-900',
  },
};

export const shadows = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  '2xl': 'shadow-2xl',
};

export const borders = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  full: 'rounded-full',
};

export const transitions = {
  fast: 'transition-all duration-150',
  normal: 'transition-all duration-200',
  slow: 'transition-all duration-300',
};

// Component Presets
export const buttonStyles = {
  primary: `px-4 py-2 ${borders.sm} bg-${colors.primary[600]} text-white font-semibold hover:bg-${colors.primary[700]} ${transitions.fast} focus:ring-2 focus:ring-${colors.primary[500]} focus:ring-offset-2`,
  secondary: `px-4 py-2 ${borders.sm} border-2 border-${colors.neutral[200]} text-${colors.neutral[700]} font-semibold hover:bg-${colors.neutral[50]} ${transitions.fast}`,
  danger: `px-4 py-2 ${borders.sm} bg-${colors.danger[600]} text-white font-semibold hover:bg-${colors.danger[700]} ${transitions.fast}`,
  ghost: `px-4 py-2 ${borders.sm} text-${colors.neutral[600]} font-semibold hover:bg-${colors.neutral[100]} ${transitions.fast}`,
  small: {
    primary: `px-3 py-1.5 text-xs ${borders.sm} bg-${colors.primary[600]} text-white font-semibold hover:bg-${colors.primary[700]} ${transitions.fast}`,
    secondary: `px-3 py-1.5 text-xs ${borders.sm} border border-${colors.neutral[200]} text-${colors.neutral[700]} font-semibold hover:bg-${colors.neutral[50]} ${transitions.fast}`,
  },
};

export const cardStyles = {
  default: `${borders.lg} border border-${colors.neutral[200]} bg-white p-6 ${shadows.sm}`,
  hover: `${borders.lg} border border-${colors.neutral[200]} bg-white p-6 ${shadows.sm} hover:${shadows.md} ${transitions.normal} cursor-pointer`,
  compact: `${borders.md} border border-${colors.neutral[200]} bg-white p-4`,
};

export const inputStyles = {
  default: `w-full px-3 py-2 ${borders.sm} border border-${colors.neutral[300]} focus:ring-2 focus:ring-${colors.primary[500]} focus:border-${colors.primary[500]} ${transitions.fast}`,
  error: `w-full px-3 py-2 ${borders.sm} border border-${colors.danger[500]} focus:ring-2 focus:ring-${colors.danger[500]} ${transitions.fast}`,
};

export const badgeStyles = {
  primary: `inline-flex items-center px-2.5 py-0.5 ${borders.full} text-xs font-semibold bg-${colors.primary[100]} text-${colors.primary[700]}`,
  success: `inline-flex items-center px-2.5 py-0.5 ${borders.full} text-xs font-semibold bg-${colors.success[100]} text-${colors.success[700]}`,
  warning: `inline-flex items-center px-2.5 py-0.5 ${borders.full} text-xs font-semibold bg-${colors.warning[100]} text-${colors.warning[700]}`,
  danger: `inline-flex items-center px-2.5 py-0.5 ${borders.full} text-xs font-semibold bg-${colors.danger[100]} text-${colors.danger[700]}`,
  neutral: `inline-flex items-center px-2.5 py-0.5 ${borders.full} text-xs font-semibold bg-${colors.neutral[100]} text-${colors.neutral[600]}`,
};
