/**
 * @fileoverview Zen Loading & Transition Components
 * @module concept2cure/components/common/ZenTransitions
 * @version 1.0.0
 *
 * @description
 * Polished loading states, skeleton screens, and transition animations
 * for a seamless user experience throughout Concept2Cure.
 *
 * Components:
 * - ZenLoader: Animated loading spinner with branding
 * - ZenSkeleton: Content placeholder skeleton screens
 * - ZenFadeIn: Fade-in animation wrapper
 * - ZenSlideIn: Slide-in animation wrapper
 * - ZenPulse: Subtle pulse animation for highlights
 */

import React from 'react';
import { motion, AnimatePresence, type Variants, type Transition } from 'framer-motion';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN LOADER
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenLoaderProps {
  readonly size?: 'sm' | 'md' | 'lg';
  readonly message?: string;
  readonly fullScreen?: boolean;
}

export const ZenLoader: React.FC<ZenLoaderProps> = ({
  size = 'md',
  message,
  fullScreen = false,
}) => {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  const Spinner = () => (
    <motion.div className={`relative ${sizes[size]}`}>
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 border-2 border-zinc-200 rounded-full"
      />
      {/* Spinning arc */}
      <motion.div
        className="absolute inset-0 border-2 border-transparent border-t-blue-600 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      {/* Center dot */}
      <motion.div
        className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 bg-blue-600 rounded-full"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    </motion.div>
  );

  if (fullScreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#faf9f5]"
      >
        <Spinner />
        {message && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-sm text-zinc-500"
          >
            {message}
          </motion.p>
        )}
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Spinner />
      {message && <p className="text-sm text-zinc-500">{message}</p>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenSkeletonProps {
  readonly variant?: 'text' | 'circular' | 'rectangular' | 'card';
  readonly width?: string | number;
  readonly height?: string | number;
  readonly lines?: number;
  readonly className?: string;
}

export const ZenSkeleton: React.FC<ZenSkeletonProps> = ({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
}) => {
  const baseClass = 'animate-pulse bg-zinc-200 rounded';

  const styles: React.CSSProperties = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1em' : variant === 'circular' ? width : undefined),
  };

  if (variant === 'circular') {
    return (
      <div
        className={`${baseClass} rounded-full ${className}`}
        style={{ ...styles, aspectRatio: '1' }}
      />
    );
  }

  if (variant === 'card') {
    return (
      <div className={`${baseClass} rounded-xl p-4 ${className}`} style={styles}>
        <div className="space-y-3">
          <div className="h-4 bg-zinc-300 rounded w-3/4" />
          <div className="h-3 bg-zinc-300 rounded w-full" />
          <div className="h-3 bg-zinc-300 rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={baseClass}
            style={{
              ...styles,
              width: i === lines - 1 ? '75%' : '100%',
            }}
          />
        ))}
      </div>
    );
  }

  return <div className={`${baseClass} ${className}`} style={styles} />;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenChatSkeleton: React.FC = () => (
  <div className="space-y-4 p-4">
    {/* User message skeleton */}
    <div className="flex justify-end">
      <div className="max-w-[70%] space-y-2">
        <ZenSkeleton variant="rectangular" height={40} className="rounded-xl" />
      </div>
    </div>
    
    {/* AI response skeleton */}
    <div className="flex gap-3">
      <ZenSkeleton variant="circular" width={36} height={36} />
      <div className="flex-1 space-y-2 max-w-[70%]">
        <ZenSkeleton variant="text" lines={3} />
      </div>
    </div>
    
    {/* User message skeleton */}
    <div className="flex justify-end">
      <div className="max-w-[60%]">
        <ZenSkeleton variant="rectangular" height={32} className="rounded-xl" />
      </div>
    </div>
    
    {/* AI response skeleton with typing indicator */}
    <div className="flex gap-3">
      <ZenSkeleton variant="circular" width={36} height={36} />
      <div className="flex-1">
        <ZenTypingIndicator />
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN TYPING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenTypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1 p-3 bg-zinc-100 rounded-xl rounded-tl-none w-fit">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="w-2 h-2 bg-zinc-400 rounded-full"
        animate={{ y: [0, -4, 0] }}
        transition={{
          duration: 0.6,
          repeat: Infinity,
          delay: i * 0.15,
        }}
      />
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenSidebarSkeleton: React.FC = () => (
  <div className="p-4 space-y-4">
    {/* Header */}
    <div className="flex items-center gap-3">
      <ZenSkeleton variant="circular" width={32} height={32} />
      <ZenSkeleton variant="text" width="60%" height={20} />
    </div>
    
    {/* Search */}
    <ZenSkeleton variant="rectangular" height={40} className="rounded-xl" />
    
    {/* Section header */}
    <ZenSkeleton variant="text" width={80} height={12} />
    
    {/* Items */}
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center gap-3 py-2">
        <ZenSkeleton variant="rectangular" width={20} height={20} className="rounded" />
        <ZenSkeleton variant="text" width={`${60 + Math.random() * 30}%`} height={16} />
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// FADE IN ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenFadeInProps {
  readonly children: React.ReactNode;
  readonly delay?: number;
  readonly duration?: number;
  readonly className?: string;
}

export const ZenFadeIn: React.FC<ZenFadeInProps> = ({
  children,
  delay = 0,
  duration = 0.3,
  className = '',
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration, delay }}
    className={className}
  >
    {children}
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE IN ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════

type SlideDirection = 'up' | 'down' | 'left' | 'right';

interface ZenSlideInProps {
  readonly children: React.ReactNode;
  readonly direction?: SlideDirection;
  readonly delay?: number;
  readonly distance?: number;
  readonly className?: string;
}

export const ZenSlideIn: React.FC<ZenSlideInProps> = ({
  children,
  direction = 'up',
  delay = 0,
  distance = 20,
  className = '',
}) => {
  const directions = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...directions[direction] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...directions[direction] }}
      transition={{ duration: 0.3, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// STAGGER CHILDREN ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenStaggerProps {
  readonly children: React.ReactNode;
  readonly staggerDelay?: number;
  readonly className?: string;
}

export const ZenStagger: React.FC<ZenStaggerProps> = ({
  children,
  staggerDelay = 0.05,
  className = '',
}) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {React.Children.map(children, (child) => (
        <motion.div variants={itemVariants}>{child}</motion.div>
      ))}
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PULSE ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenPulseProps {
  readonly children: React.ReactNode;
  readonly active?: boolean;
  readonly color?: string;
  readonly className?: string;
}

export const ZenPulse: React.FC<ZenPulseProps> = ({
  children,
  active = true,
  color = 'rgba(217, 119, 87, 0.4)',
  className = '',
  color = 'rgba(37, 99, 235, 0.4)',
  className,
}) => (
  <div className={cn('relative', className)}>
    {children}
    {active && (
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ boxShadow: `0 0 0 0 ${color}` }}
        animate={{
          boxShadow: [
            `0 0 0 0 ${color}`,
            `0 0 0 8px transparent`,
          ],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
        }}
      />
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════════════════

type ProgressSize = 'sm' | 'md' | 'lg';
type ProgressColor = 'blue' | 'green' | 'amber' | 'red';

interface ZenProgressProps {
  readonly value: number;
  readonly max?: number;
  readonly showLabel?: boolean;
  readonly size?: ProgressSize;
  readonly color?: ProgressColor;
  readonly className?: string;
}

export const ZenProgress: React.FC<ZenProgressProps> = ({
  value,
  max = 100,
  showLabel = false,
  size = 'md',
  color = 'blue',
  className = '',
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const heights = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const colors = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    amber: 'bg-amber-500',
    red: 'bg-red-600',
  };

  return (
    <div className={className}>
      <div className={`w-full bg-zinc-200 rounded-full overflow-hidden ${heights[size]}`}>
        <motion.div
          className={`${heights[size]} ${colors[color]} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      {showLabel && (
        <p className="mt-1 text-xs text-zinc-500 text-right">{Math.round(percentage)}%</p>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE TRANSITION WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenPageTransitionProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export const ZenPageTransition: React.FC<ZenPageTransitionProps> = ({
  children,
  className = '',
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.2 }}
    className={className}
  >
    {children}
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MOTION PANEL — animated slide-in drawer for tool panels and side sheets
// ═══════════════════════════════════════════════════════════════════════════════

type PanelSide = 'left' | 'right';

interface MotionPanelProps {
  readonly children: React.ReactNode;
  readonly isOpen: boolean;
  readonly onClose?: () => void;
  /** Which edge the panel slides from */
  readonly side?: PanelSide;
  /** Panel width (Tailwind class) */
  readonly width?: string;
  /** Show backdrop overlay */
  readonly backdrop?: boolean;
  readonly className?: string;
}

export const MotionPanel: React.FC<MotionPanelProps> = ({
  children,
  isOpen,
  onClose,
  side = 'right',
  width = 'w-80',
  backdrop = true,
  className,
}) => {
  const slideFrom = side === 'right' ? '100%' : '-100%';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {backdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/20 z-40"
              onClick={onClose}
              aria-hidden="true"
            />
          )}
          <motion.div
            initial={{ x: slideFrom, opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: slideFrom, opacity: 0.8 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={cn(
              'fixed top-0 h-full bg-white shadow-xl z-50 overflow-y-auto border-zinc-200',
              side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
              width,
              className,
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MOTION MODAL — animated backdrop + centered content
// ═══════════════════════════════════════════════════════════════════════════════

interface MotionModalProps {
  readonly children: React.ReactNode;
  readonly isOpen: boolean;
  readonly onClose?: () => void;
  readonly className?: string;
  /** Accessible label for the dialog */
  readonly ariaLabel?: string;
}

export const MotionModal: React.FC<MotionModalProps> = ({
  children,
  isOpen,
  onClose,
  className,
  ariaLabel,
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
          aria-hidden="true"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className={cn(
            'relative z-10 bg-white rounded-xl shadow-2xl border border-zinc-200',
            className,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          {children}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MOTION LIST — staggered list reveal for data grids and card lists
// ═══════════════════════════════════════════════════════════════════════════════

interface MotionListProps {
  readonly children: React.ReactNode;
  /** Unique key to trigger re-animation (e.g., filter state) */
  readonly stateKey?: string;
  /** Delay in ms between each child item reveal (default: 30) */
  readonly staggerMs?: number;
  readonly className?: string;
}

const listContainerVariants: Variants = {
  hidden: {},
  visible: (staggerMs: number) => ({
    transition: { staggerChildren: staggerMs / 1000 },
  }),
};

const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.15 } },
};

export const MotionList: React.FC<MotionListProps> = ({
  children,
  stateKey,
  staggerMs = 30,
  className,
}) => (
  <motion.div
    key={stateKey}
    variants={listContainerVariants}
    initial="hidden"
    animate="visible"
    custom={staggerMs}
    className={className}
  >
    {React.Children.map(children, (child) =>
      child ? <motion.div variants={listItemVariants}>{child}</motion.div> : null,
    )}
  </motion.div>
);

interface MotionListItemProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

/** Wrap individual items when you need more control over staggered reveals */
export const MotionListItem: React.FC<MotionListItemProps> = ({
  children,
  className,
}) => (
  <motion.div variants={listItemVariants} className={className}>
    {children}
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MOTION LAYOUT — AnimatePresence wrapper for layout/page transitions
// ═══════════════════════════════════════════════════════════════════════════════

interface MotionLayoutProps {
  /** Unique key representing the current view (e.g., layoutMode) — changes trigger transition */
  readonly layoutKey: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}

/** Apple-quality ease curve for layout transitions */
const layoutTransition: Transition = { duration: 0.15, ease: [0.2, 0, 0, 1] };

export const MotionLayout: React.FC<MotionLayoutProps> = ({
  layoutKey,
  children,
  className,
}) => (
  <AnimatePresence mode="wait">
    <motion.div
      key={layoutKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={layoutTransition}
      className={className}
    >
      {children}
    </motion.div>
  </AnimatePresence>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MOTION SHIMMER SKELETON — polished shimmer effect
// ═══════════════════════════════════════════════════════════════════════════════

interface MotionShimmerProps {
  /** Number of skeleton lines (default: 3) */
  readonly lines?: number;
  /** Show a circular avatar placeholder */
  readonly avatar?: boolean;
  readonly className?: string;
}

export const MotionShimmer: React.FC<MotionShimmerProps> = ({
  lines = 3,
  avatar = false,
  className,
}) => (
  <div className={cn('space-y-3', className)} role="status" aria-label="Loading content">
    {avatar && (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-zinc-200 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-zinc-200 rounded w-1/3 animate-pulse" />
          <div className="h-2.5 bg-zinc-100 rounded w-1/4 animate-pulse" />
        </div>
      </div>
    )}
    {Array.from({ length: lines }).map((_, i) => (
      <motion.div
        key={i}
        className="h-3 bg-zinc-200 rounded"
        style={{ width: i === lines - 1 ? '60%' : i === 0 ? '90%' : '100%' }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
      />
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MOTION COLLAPSE — accordion-style expand/collapse
// ═══════════════════════════════════════════════════════════════════════════════

interface MotionCollapseProps {
  readonly children: React.ReactNode;
  readonly isOpen: boolean;
  readonly className?: string;
}

export const MotionCollapse: React.FC<MotionCollapseProps> = ({
  children,
  isOpen,
  className,
}) => (
  <AnimatePresence initial={false}>
    {isOpen && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        className={cn('overflow-hidden', className)}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MOTION NUMBER — animated number counter
// ═══════════════════════════════════════════════════════════════════════════════

interface MotionNumberProps {
  readonly value: number;
  /** Number of decimal places (default: 0) */
  readonly decimals?: number;
  readonly className?: string;
}

export const MotionNumber: React.FC<MotionNumberProps> = ({
  value,
  decimals = 0,
  className = '',
}) => {
  const [displayValue, setDisplayValue] = React.useState(0);

  React.useEffect(() => {
    const duration = 600;
    const startTime = Date.now();
    const startValue = displayValue;
    const diff = value - startValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + diff * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={className}>
      {displayValue.toFixed(decimals)}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  ZenLoader,
  ZenSkeleton,
  ZenChatSkeleton,
  ZenTypingIndicator,
  ZenSidebarSkeleton,
  ZenFadeIn,
  ZenSlideIn,
  ZenStagger,
  ZenPulse,
  ZenProgress,
  ZenPageTransition,
  MotionPanel,
  MotionModal,
  MotionList,
  MotionListItem,
  MotionLayout,
  MotionShimmer,
  MotionCollapse,
  MotionNumber,
};
