/**
 * TrialSage Design System - Metric Card
 *
 * Beautiful, data-rich metric cards for dashboards.
 * Designed for at-a-glance insights with elegant typography.
 *
 * @version 3.0.0
 */

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from 'lucide-react';
import { colors } from '../tokens';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MetricCardProps {
  /** The metric label */
  label: string;
  /** The primary value to display */
  value: string | number;
  /** Optional secondary value or context */
  secondaryValue?: string;
  /** Change percentage (positive = up, negative = down) */
  change?: number;
  /** Custom change label (e.g., "vs last month") */
  changeLabel?: string;
  /** Trend direction for visual indicator */
  trend?: 'up' | 'down' | 'stable';
  /** Whether an increase is positive (green) or negative (red) */
  increaseIsGood?: boolean;
  /** Icon component to display */
  icon?: LucideIcon;
  /** Icon color override */
  iconColor?: string;
  /** Icon background color override */
  iconBg?: string;
  /** Card size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Interactive - adds hover effect */
  interactive?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
  /** Loading state */
  loading?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

const MetricSkeleton: React.FC<{ size: 'sm' | 'md' | 'lg' }> = ({ size }) => (
  <div className="animate-pulse">
    <div className="flex items-start justify-between">
      <div className="space-y-2 flex-1">
        <div className="h-3 w-20 bg-neutral-200 rounded" />
        <div
          className={cn(
            'bg-neutral-200 rounded',
            size === 'sm' ? 'h-6 w-16' : size === 'md' ? 'h-8 w-20' : 'h-10 w-24'
          )}
        />
      </div>
      <div
        className={cn(
          'rounded-xl bg-neutral-100',
          size === 'sm' ? 'w-8 h-8' : size === 'md' ? 'w-10 h-10' : 'w-12 h-12'
        )}
      />
    </div>
    <div className="mt-3 h-3 w-24 bg-neutral-100 rounded" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SPARKLINE (Mini trend visualization)
// ═══════════════════════════════════════════════════════════════════════════════

interface SparklineProps {
  data?: number[];
  color?: string;
  className?: string;
}

const Sparkline: React.FC<SparklineProps> = memo(
  ({ data = [4, 6, 3, 8, 5, 9, 7, 10, 8, 12], color = colors.primary[500], className }) => {
    const width = 60;
    const height = 20;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn('overflow-visible', className)}
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-50"
        />
        {/* Gradient fill */}
        <defs>
          <linearGradient id="sparklineGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill="url(#sparklineGradient)"
        />
      </svg>
    );
  }
);

Sparkline.displayName = 'Sparkline';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const MetricCard: React.FC<MetricCardProps> = memo(
  ({
    label,
    value,
    secondaryValue,
    change,
    changeLabel,
    trend,
    increaseIsGood = true,
    icon: Icon,
    iconColor,
    iconBg,
    size = 'md',
    interactive = false,
    onClick,
    className,
    loading = false,
  }) => {
    // Determine colors based on trend and whether increase is good
    const getTrendColor = () => {
      if (trend === 'stable' || change === 0) return 'text-neutral-500';

      const isPositive = trend === 'up' || (change !== undefined && change > 0);
      const isGood = increaseIsGood ? isPositive : !isPositive;

      return isGood ? 'text-success-600' : 'text-error-600';
    };

    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

    // Size-based styling
    const sizeConfig = {
      sm: {
        padding: 'p-4',
        iconSize: 'w-8 h-8',
        iconInner: 'w-4 h-4',
        valueSize: 'text-2xl',
        labelSize: 'text-xs',
        changeSize: 'text-xs',
      },
      md: {
        padding: 'p-5',
        iconSize: 'w-10 h-10',
        iconInner: 'w-5 h-5',
        valueSize: 'text-3xl',
        labelSize: 'text-sm',
        changeSize: 'text-sm',
      },
      lg: {
        padding: 'p-6',
        iconSize: 'w-12 h-12',
        iconInner: 'w-6 h-6',
        valueSize: 'text-4xl',
        labelSize: 'text-base',
        changeSize: 'text-sm',
      },
    };

    const config = sizeConfig[size];

    const CardWrapper = interactive ? motion.div : 'div';
    const cardProps = interactive
      ? {
          whileHover: { y: -2, boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.08)' },
          whileTap: { scale: 0.99 },
          transition: { duration: 0.2 },
        }
      : {};

    return (
      <CardWrapper
        className={cn(
          'relative bg-white rounded-xl border border-neutral-200',
          config.padding,
          interactive && 'cursor-pointer hover:border-neutral-300',
          'transition-all duration-200',
          className
        )}
        onClick={onClick}
        {...cardProps}
      >
        {loading ? (
          <MetricSkeleton size={size} />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Label */}
                <p className={cn('font-medium text-neutral-500 truncate', config.labelSize)}>
                  {label}
                </p>

                {/* Value */}
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    className={cn('font-bold text-neutral-900 tracking-tight', config.valueSize)}
                  >
                    {value}
                  </span>
                  {secondaryValue && (
                    <span className={cn('text-neutral-400 font-medium', config.changeSize)}>
                      {secondaryValue}
                    </span>
                  )}
                </div>
              </div>

              {/* Icon */}
              {Icon && (
                <div
                  className={cn(
                    'flex items-center justify-center rounded-xl flex-shrink-0',
                    config.iconSize
                  )}
                  style={{
                    backgroundColor: iconBg || colors.primary[50],
                  }}
                >
                  <Icon
                    className={config.iconInner}
                    style={{ color: iconColor || colors.primary[600] }}
                  />
                </div>
              )}
            </div>

            {/* Change indicator */}
            {(change !== undefined || changeLabel) && (
              <div
                className={cn('flex items-center gap-1.5 mt-3', config.changeSize, getTrendColor())}
              >
                <TrendIcon className="w-4 h-4" />
                {change !== undefined && (
                  <span className="font-medium">
                    {change > 0 ? '+' : ''}
                    {change}%
                  </span>
                )}
                {changeLabel && <span className="text-neutral-400 font-normal">{changeLabel}</span>}
              </div>
            )}

            {/* Interactive arrow indicator */}
            {interactive && (
              <div className="absolute bottom-4 right-4">
                <ArrowUpRight className="w-4 h-4 text-neutral-300" />
              </div>
            )}
          </>
        )}
      </CardWrapper>
    );
  }
);

MetricCard.displayName = 'MetricCard';

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CARD GROUP
// ═══════════════════════════════════════════════════════════════════════════════

interface MetricCardGroupProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export const MetricCardGroup: React.FC<MetricCardGroupProps> = ({
  children,
  columns = 4,
  className,
}) => (
  <div
    className={cn(
      'grid gap-4',
      columns === 2 && 'grid-cols-1 sm:grid-cols-2',
      columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      columns === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
      className
    )}
  >
    {children}
  </div>
);

export default MetricCard;
