/**
 * @fileoverview Concept2Cure Brand Logo Component
 * @module concept2cure/components/brand/C2CLogo
 *
 * Text-based brand mark. No image dependency.
 */

import React from 'react';
import { cn } from '@/lib/utils';

type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
type LogoVariant = 'default' | 'sidebar' | 'header' | 'login' | 'icon';

interface C2CLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
  iconOnly?: boolean;
  alt?: string;
  onClick?: () => void;
}

const SIZE_MAP: Record<LogoSize, { box: string; text: string }> = {
  xs: { box: 'h-6 w-6', text: 'text-[8px]' },
  sm: { box: 'h-8 w-8', text: 'text-[9px]' },
  md: { box: 'h-12 w-12', text: 'text-xs' },
  lg: { box: 'h-16 w-16', text: 'text-sm' },
  xl: { box: 'h-24 w-24', text: 'text-lg' },
  full: { box: 'h-32 w-32', text: 'text-xl' },
};

const VARIANT_SIZES: Record<LogoVariant, LogoSize> = {
  default: 'md',
  sidebar: 'sm',
  header: 'md',
  login: 'xl',
  icon: 'sm',
};

export const C2CLogo: React.FC<C2CLogoProps> = ({
  size,
  variant = 'default',
  className,
  onClick,
}) => {
  const effectiveSize = size || VARIANT_SIZES[variant];
  const { box, text } = SIZE_MAP[effectiveSize];

  return (
    <div
      className={cn('rounded-xl bg-stone-800 flex items-center justify-center', box, className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <span className={cn('font-bold text-white', text)}>C2C</span>
    </div>
  );
};

export const C2CIcon: React.FC<{
  size?: LogoSize;
  className?: string;
  onClick?: () => void;
}> = ({ size = 'sm', className, onClick }) => (
  <C2CLogo size={size} className={className} onClick={onClick} />
);

export default C2CLogo;
