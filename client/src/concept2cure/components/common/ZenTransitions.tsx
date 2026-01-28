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
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN LOADER
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
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
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#FAFAF9]"
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
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
  lines?: number;
  className?: string;
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
        <ZenSkeleton variant="rectangular" height={40} className="rounded-2xl" />
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
        <ZenSkeleton variant="rectangular" height={32} className="rounded-2xl" />
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
  <div className="flex items-center gap-1 p-3 bg-zinc-100 rounded-2xl rounded-tl-none w-fit">
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
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
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

interface ZenSlideInProps {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  distance?: number;
  className?: string;
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
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
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
  children: React.ReactNode;
  active?: boolean;
  color?: string;
  className?: string;
}

export const ZenPulse: React.FC<ZenPulseProps> = ({
  children,
  active = true,
  color = 'rgba(37, 99, 235, 0.4)',
  className = '',
}) => (
  <div className={`relative ${className}`}>
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

interface ZenProgressProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'amber' | 'red';
  className?: string;
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
  children: React.ReactNode;
  className?: string;
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
};
