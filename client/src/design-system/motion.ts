/**
 * Concept2Cure Design System - Motion & Animation
 *
 * Thoughtful animations that enhance the user experience without distraction.
 * Follows the principle of purposeful motion - every animation should have meaning.
 *
 * @version 3.0.0
 */

import { keyframes } from '@emotion/react';

// ═══════════════════════════════════════════════════════════════════════════════
// KEYFRAME ANIMATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fade animations
 */
export const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

export const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`;

/**
 * Slide animations (for panels, drawers, modals)
 */
export const slideInFromRight = keyframes`
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

export const slideInFromLeft = keyframes`
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

export const slideInFromBottom = keyframes`
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

export const slideInFromTop = keyframes`
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

/**
 * Scale animations (for modals, popovers)
 */
export const scaleIn = keyframes`
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
`;

export const scaleOut = keyframes`
  from {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(0.95);
    opacity: 0;
  }
`;

/**
 * Subtle entrance for content
 */
export const contentShow = keyframes`
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

/**
 * Pulse animation for loading/attention states
 */
export const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
`;

/**
 * Skeleton shimmer effect
 */
export const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

/**
 * Spin animation for loading spinners
 */
export const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

/**
 * Bounce animation for attention
 */
export const bounce = keyframes`
  0%, 100% {
    transform: translateY(0);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: translateY(-25%);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
`;

/**
 * Typing indicator animation (like chat apps)
 */
export const typingDot = keyframes`
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.6;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
`;

/**
 * Gentle shake for errors/invalid
 */
export const shake = keyframes`
  0%, 100% {
    transform: translateX(0);
  }
  10%, 30%, 50%, 70%, 90% {
    transform: translateX(-4px);
  }
  20%, 40%, 60%, 80% {
    transform: translateX(4px);
  }
`;

/**
 * Progress bar indeterminate
 */
export const indeterminateProgress = keyframes`
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATION PRESETS (CSS-ready strings)
// ═══════════════════════════════════════════════════════════════════════════════

export const animationPresets = {
  // Entrances
  fadeIn: 'fadeIn 200ms ease-out forwards',
  fadeInFast: 'fadeIn 100ms ease-out forwards',
  fadeInSlow: 'fadeIn 300ms ease-out forwards',
  slideUp: 'slideInFromBottom 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  slideDown: 'slideInFromTop 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  slideRight: 'slideInFromLeft 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  slideLeft: 'slideInFromRight 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  scaleIn: 'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  contentShow: 'contentShow 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',

  // Exits
  fadeOut: 'fadeOut 150ms ease-in forwards',
  scaleOut: 'scaleOut 150ms ease-in forwards',

  // Continuous
  pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  spin: 'spin 1s linear infinite',
  bounce: 'bounce 1s infinite',
  shimmer: 'shimmer 2s infinite linear',

  // Feedback
  shake: 'shake 400ms ease-out',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CSS ANIMATION CLASSES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tailwind-compatible animation utility classes
 */
export const animationClasses = {
  // Base animation classes
  'animate-fade-in': 'animate-[fadeIn_200ms_ease-out_forwards]',
  'animate-fade-out': 'animate-[fadeOut_150ms_ease-in_forwards]',
  'animate-slide-up': 'animate-[slideInFromBottom_250ms_cubic-bezier(0.16,1,0.3,1)_forwards]',
  'animate-slide-down': 'animate-[slideInFromTop_250ms_cubic-bezier(0.16,1,0.3,1)_forwards]',
  'animate-slide-left': 'animate-[slideInFromRight_250ms_cubic-bezier(0.16,1,0.3,1)_forwards]',
  'animate-slide-right': 'animate-[slideInFromLeft_250ms_cubic-bezier(0.16,1,0.3,1)_forwards]',
  'animate-scale-in': 'animate-[scaleIn_200ms_cubic-bezier(0.16,1,0.3,1)_forwards]',
  'animate-content-show': 'animate-[contentShow_200ms_cubic-bezier(0.16,1,0.3,1)_forwards]',

  // Continuous animations
  'animate-pulse-subtle': 'animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]',
  'animate-spin-slow': 'animate-[spin_2s_linear_infinite]',
  'animate-shimmer': 'animate-[shimmer_2s_infinite_linear]',

  // Feedback animations
  'animate-shake': 'animate-[shake_400ms_ease-out]',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SPRING ANIMATION CONFIGS (for Framer Motion / React Spring)
// ═══════════════════════════════════════════════════════════════════════════════

export const springConfigs = {
  // Snappy, responsive feel
  snappy: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 30,
    mass: 1,
  },

  // Smooth, elegant feel
  gentle: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 20,
    mass: 1,
  },

  // Bouncy, playful feel
  bouncy: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 10,
    mass: 1,
  },

  // Slow, deliberate feel
  slow: {
    type: 'spring' as const,
    stiffness: 100,
    damping: 20,
    mass: 1,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// FRAMER MOTION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pre-built animation variants for common patterns
 */
export const motionVariants = {
  // Page transitions
  page: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },

  // Modal/dialog
  modal: {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 10 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },

  // Overlay backdrop
  overlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  },

  // Dropdown menu
  dropdown: {
    initial: { opacity: 0, y: -4, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -4, scale: 0.95 },
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] },
  },

  // Slide panel (right)
  slidePanel: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },

  // Toast notification
  toast: {
    initial: { opacity: 0, y: 50, scale: 0.9 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 20, scale: 0.9 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },

  // List item stagger
  listItem: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2 },
  },

  // Card hover
  cardHover: {
    initial: { y: 0, boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.04)' },
    hover: { y: -2, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)' },
    transition: { duration: 0.2, ease: 'easeOut' },
  },

  // Button press
  buttonPress: {
    initial: { scale: 1 },
    tap: { scale: 0.98 },
    transition: { duration: 0.1 },
  },

  // Typing indicator
  typingIndicator: {
    animate: {
      y: [0, -4, 0],
      opacity: [0.6, 1, 0.6],
    },
    transition: {
      duration: 0.6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// STAGGER CONTAINERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Container variants for staggered children animations
 */
export const staggerContainers = {
  // Fast stagger (cards, list items)
  fast: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  },

  // Normal stagger
  normal: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  },

  // Slow stagger (for emphasis)
  slow: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// REDUCED MOTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reduced motion variants for accessibility
 * These should be used when prefers-reduced-motion is detected
 */
export const reducedMotionVariants = {
  page: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.1 },
  },

  modal: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.1 },
  },

  // Same structure but instant
  instant: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0 },
  },
} as const;
