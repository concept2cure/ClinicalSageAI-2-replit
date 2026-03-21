/**
 * Enterprise UI Primitives
 *
 * Enforces design consistency across the entire ClinicalSageAI platform.
 * Every card, header, badge, button bar, and layout primitive lives here.
 *
 * Design system: Zen (Claude.ai-inspired minimalism)
 *
 * RULES:
 * - Cards: rounded-xl, border border-zinc-200, shadow-sm, bg-white
 * - Headings: text-zinc-900, font-semibold (h2=text-lg, h3=text-base, h4=text-sm)
 * - Body text: text-zinc-600, text-sm
 * - Muted text: text-zinc-500, text-xs
 * - Icons inline: w-4 h-4, in boxes: w-5 h-5 inside w-10 h-10 container
 * - Spacing: p-5 card padding, gap-4 between sections, gap-2 between items
 * - Focus: focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
 * - Transitions: transition-colors duration-150
 * - Buttons: rounded-lg, px-4 py-2, text-sm font-medium
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface EnterpriseCardProps {
  children: React.ReactNode;
  className?: string;
  /** Adds hover shadow + pointer cursor */
  interactive?: boolean;
  /** Removes padding — useful when child sections handle their own padding */
  noPadding?: boolean;
  onClick?: () => void;
}

export function EnterpriseCard({
  children,
  className,
  interactive = false,
  noPadding = false,
  onClick,
}: EnterpriseCardProps) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden',
        !noPadding && 'p-5',
        interactive && 'hover:shadow-md hover:border-zinc-300 transition-all duration-150 cursor-pointer',
        onClick && 'w-full text-left focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none',
        className,
      )}
    >
      {children}
    </Component>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARD HEADER
// ═══════════════════════════════════════════════════════════════════════════════

interface CardHeaderProps {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  subtitle?: string;
  /** Right-side slot for badges, buttons, etc. */
  actions?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CardHeader({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  actions,
  size = 'md',
  className,
}: CardHeaderProps) {
  const titleSize = {
    sm: 'text-sm font-medium',
    md: 'text-base font-semibold',
    lg: 'text-lg font-semibold',
  }[size];

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <IconBox icon={Icon} className={iconClassName} />
        )}
        <div className="min-w-0">
          <h3 className={cn(titleSize, 'text-zinc-900 truncate')}>{title}</h3>
          {subtitle && (
            <p className="text-sm text-zinc-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARD SECTION — divider + padded section within a noPadding card
// ═══════════════════════════════════════════════════════════════════════════════

interface CardSectionProps {
  children: React.ReactNode;
  className?: string;
  /** Background tint (default: transparent) */
  tint?: 'none' | 'muted' | 'accent' | 'success' | 'warning' | 'danger';
  /** Show top border */
  border?: boolean;
}

const tintMap = {
  none: '',
  muted: 'bg-zinc-50',
  accent: 'bg-blue-50',
  success: 'bg-emerald-50',
  warning: 'bg-amber-50',
  danger: 'bg-red-50',
};

export function CardSection({ children, className, tint = 'none', border = true }: CardSectionProps) {
  return (
    <div className={cn(
      'px-5 py-4',
      border && 'border-t border-zinc-100',
      tintMap[tint],
      className,
    )}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION HEADER — for page-level or panel-level headings
// ═══════════════════════════════════════════════════════════════════════════════

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  actions?: React.ReactNode;
  className?: string;
  /** Heading level (visual only, always renders as div for flexibility) */
  level?: 1 | 2 | 3;
}

export function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  actions,
  className,
  level = 2,
}: SectionHeaderProps) {
  const headingStyle = {
    1: 'text-xl font-semibold tracking-tight',
    2: 'text-lg font-semibold',
    3: 'text-base font-semibold',
  }[level];

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <IconBox icon={Icon} size="lg" className={iconClassName} />}
        <div className="min-w-0">
          <div className={cn(headingStyle, 'text-zinc-900')}>{title}</div>
          {subtitle && (
            <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICON BOX — consistent colored icon container
// ═══════════════════════════════════════════════════════════════════════════════

interface IconBoxProps {
  icon: LucideIcon;
  /** Tailwind bg/text classes for theming. Default: bg-blue-100 text-blue-600 */
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const iconBoxSizes = {
  sm: { container: 'w-8 h-8 rounded-md', icon: 16 },
  md: { container: 'w-10 h-10 rounded-lg', icon: 18 },
  lg: { container: 'w-12 h-12 rounded-lg', icon: 22 },
};

export function IconBox({ icon: Icon, className, size = 'md' }: IconBoxProps) {
  const s = iconBoxSizes[size];
  return (
    <div className={cn(
      s.container,
      'flex items-center justify-center flex-shrink-0',
      className || 'bg-blue-100 text-blue-600',
    )}>
      <Icon size={s.icon} strokeWidth={2} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS PILL — unified status badge
// ═══════════════════════════════════════════════════════════════════════════════

type StatusVariant = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'purple' | 'active';

interface StatusPillProps {
  label: string;
  variant?: StatusVariant;
  className?: string;
  /** Show a pulsing dot indicator */
  dot?: boolean;
}

const statusVariants: Record<StatusVariant, string> = {
  default: 'bg-zinc-100 text-zinc-600',
  info: 'bg-blue-100 text-blue-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  active: 'bg-blue-100 text-blue-700',
};

export function StatusPill({ label, variant = 'default', className, dot }: StatusPillProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
      statusVariants[variant],
      className,
    )}>
      {dot && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full',
          variant === 'success' && 'bg-emerald-500',
          variant === 'danger' && 'bg-red-500',
          variant === 'warning' && 'bg-amber-500',
          variant === 'info' && 'bg-blue-500',
          variant === 'active' && 'bg-blue-500 animate-pulse',
          variant === 'default' && 'bg-zinc-400',
          variant === 'purple' && 'bg-purple-500',
        )} />
      )}
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE BUTTON — consistent action buttons
// ═══════════════════════════════════════════════════════════════════════════════

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'purple';
type ButtonSize = 'sm' | 'md' | 'lg';

interface EnterpriseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
}

const buttonVariantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
  secondary: 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300',
  ghost: 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm',
  purple: 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm',
};

const buttonSizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

export function EnterpriseButton({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading,
  fullWidth,
  children,
  className,
  disabled,
  ...props
}: EnterpriseButtonProps) {
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none',
        'disabled:opacity-50 disabled:pointer-events-none',
        buttonVariantStyles[variant],
        buttonSizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <svg className={cn('animate-spin', size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : Icon ? (
        <Icon size={iconSize} />
      ) : null}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} />}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CARD — for KPIs and stats
// ═══════════════════════════════════════════════════════════════════════════════

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconClassName?: string;
  change?: { value: string; positive?: boolean };
  className?: string;
}

export function MetricCard({ label, value, icon: Icon, iconClassName, change, className }: MetricCardProps) {
  return (
    <EnterpriseCard className={cn('flex items-start gap-4', className)}>
      {Icon && <IconBox icon={Icon} className={iconClassName} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-500">{label}</p>
        <p className="text-2xl font-semibold text-zinc-900 mt-1">{value}</p>
        {change && (
          <p className={cn(
            'text-xs font-medium mt-1',
            change.positive ? 'text-emerald-600' : 'text-red-600',
          )}>
            {change.value}
          </p>
        )}
      </div>
    </EnterpriseCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA ROW — consistent label/value pair
// ═══════════════════════════════════════════════════════════════════════════════

interface DataRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function DataRow({ label, value, className }: DataRowProps) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2', className)}>
      <dt className="text-sm text-zinc-500 flex-shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-zinc-900 text-right truncate">{value}</dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════════════

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <div className="w-14 h-14 rounded-lg bg-zinc-100 flex items-center justify-center mb-4">
        <Icon size={24} className="text-zinc-400" />
      </div>
      <h3 className="text-base font-semibold text-zinc-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION BAR — consistent row of action buttons (card footer)
// ═══════════════════════════════════════════════════════════════════════════════

interface ActionBarProps {
  children: React.ReactNode;
  /** Left-side slot (e.g., secondary actions) */
  left?: React.ReactNode;
  className?: string;
}

export function ActionBar({ children, left, className }: ActionBarProps) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-3 pt-4 border-t border-zinc-100',
      className,
    )}>
      <div className="flex items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST ITEM — consistent clickable list row
// ═══════════════════════════════════════════════════════════════════════════════

interface ListItemProps {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  /** Show chevron indicator */
  chevron?: boolean;
}

export function ListItem({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  meta,
  actions,
  onClick,
  className,
  chevron = false,
}: ListItemProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg',
        onClick && 'cursor-pointer hover:bg-zinc-50 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none',
        className,
      )}
    >
      {Icon && <IconBox icon={Icon} size="sm" className={iconClassName} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 truncate">{title}</p>
        {subtitle && <p className="text-xs text-zinc-500 truncate mt-0.5">{subtitle}</p>}
      </div>
      {meta && <div className="flex-shrink-0">{meta}</div>}
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      {chevron && <ChevronRight size={16} className="text-zinc-400 flex-shrink-0" />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIVIDER
// ═══════════════════════════════════════════════════════════════════════════════

interface DividerProps {
  label?: string;
  className?: string;
}

export function Divider({ label, className }: DividerProps) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3 py-3', className)}>
        <div className="flex-1 h-px bg-zinc-200" />
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
        <div className="flex-1 h-px bg-zinc-200" />
      </div>
    );
  }
  return <div className={cn('h-px bg-zinc-100 my-4', className)} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════════════════

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const progressVariants = {
  default: 'bg-blue-600',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  danger: 'bg-red-600',
};

export function ProgressBar({
  value,
  max = 100,
  variant = 'default',
  size = 'sm',
  showLabel = false,
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn(
        'flex-1 rounded-full bg-zinc-100 overflow-hidden',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
      )}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', progressVariants[variant])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-zinc-600 tabular-nums w-10 text-right">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON — loading placeholder
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded-md bg-zinc-200', className)} />
  );
}

// Re-export for convenience
export { cn };
