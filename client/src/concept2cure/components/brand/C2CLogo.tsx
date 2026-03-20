/**
 * @fileoverview Concept2Cure Brand Logo Component
 * @module concept2cure/components/brand/C2CLogo
 *
 * Renders the official Concept2Cure logo with gradient soft blending
 * into its surrounding background. Supports multiple sizes and orientations.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import logoSrc from '@/assets/concept2cure-logo.jpg';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
type LogoVariant = 'default' | 'sidebar' | 'header' | 'login' | 'icon';

interface C2CLogoProps {
  /** Size preset */
  size?: LogoSize;
  /** Usage context for automatic sizing/styling */
  variant?: LogoVariant;
  /** Custom className */
  className?: string;
  /** Whether to show just the icon (cropped DNA helix) */
  iconOnly?: boolean;
  /** Custom alt text */
  alt?: string;
  /** Click handler */
  onClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIZE MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════

const SIZE_CLASSES: Record<LogoSize, string> = {
  xs: 'h-6',
  sm: 'h-8',
  md: 'h-12',
  lg: 'h-16',
  xl: 'h-24',
  full: 'h-32',
};

const VARIANT_SIZES: Record<LogoVariant, LogoSize> = {
  default: 'md',
  sidebar: 'sm',
  header: 'md',
  login: 'xl',
  icon: 'sm',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const C2CLogo: React.FC<C2CLogoProps> = ({
  size,
  variant = 'default',
  className,
  iconOnly = false,
  alt = 'Concept2Cure',
  onClick,
}) => {
  const effectiveSize = size || VARIANT_SIZES[variant];

  if (iconOnly) {
    // Render just the DNA helix icon (cropped from full logo)
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg flex items-center justify-center',
          SIZE_CLASSES[effectiveSize],
          'aspect-square',
          className
        )}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        style={{ cursor: onClick ? 'pointer' : undefined }}
      >
        {/* Gradient blend mask */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, transparent 40%, var(--color-bg, #faf9f5) 100%)`,
          }}
        />
        <img
          src={logoSrc}
          alt={alt}
          className="w-[200%] h-[200%] object-cover object-top"
          style={{
            filter: 'contrast(1.05)',
            transform: 'translateY(-5%)',
          }}
          draggable={false}
        />
      </div>
    );
  }

  // Full logo with gradient soft blend into background
  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      {/* The logo image with soft gradient edges that blend into the background */}
      <div className="relative">
        <img
          src={logoSrc}
          alt={alt}
          className={cn(
            SIZE_CLASSES[effectiveSize],
            'w-auto object-contain'
          )}
          draggable={false}
        />
        {/* Gradient soft blend overlay - fades edges into surrounding background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              linear-gradient(to right, var(--color-bg, #faf9f5) 0%, transparent 8%, transparent 92%, var(--color-bg, #faf9f5) 100%),
              linear-gradient(to bottom, var(--color-bg, #faf9f5) 0%, transparent 5%, transparent 90%, var(--color-bg, #faf9f5) 100%)
            `,
          }}
        />
      </div>
    </div>
  );
};

/**
 * Standalone icon variant — DNA helix only, no text
 * For favicon, small sidebar, and compact displays
 */
export const C2CIcon: React.FC<{
  size?: LogoSize;
  className?: string;
  onClick?: () => void;
}> = ({ size = 'sm', className, onClick }) => (
  <C2CLogo
    size={size}
    iconOnly
    className={className}
    onClick={onClick}
  />
);

export default C2CLogo;
