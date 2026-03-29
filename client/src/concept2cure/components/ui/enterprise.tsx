/**
 * Enterprise UI Primitives
 *
 * Enforces design consistency across the entire ClinicalSageAI platform.
 * Every card, header, badge, button bar, and layout primitive lives here.
 *
 * Design system: Zen (Claude.ai-inspired minimalism)
 *
 * RULES:
 * - Cards: rounded-xl, border border-stone-200, shadow-sm, bg-white
 * - Headings: text-stone-900, font-semibold (h2=text-lg, h3=text-base, h4=text-sm)
 * - Body text: text-stone-600, text-sm
 * - Muted text: text-stone-500, text-xs
 * - Icons inline: w-4 h-4, in boxes: w-5 h-5 inside w-10 h-10 container
 * - Spacing: p-5 card padding, gap-4 between sections, gap-2 between items
 * - Focus: focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2
 * - Transitions: transition-colors duration-150
 * - Buttons: rounded-lg, px-4 py-2, text-sm font-medium
 */

import React, { useEffect, useRef, useId } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface EnterpriseCardProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  /** Adds hover shadow + pointer cursor */
  readonly interactive?: boolean;
  /** Removes padding — useful when child sections handle their own padding */
  readonly noPadding?: boolean;
  readonly onClick?: () => void;
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
        'bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden',
        !noPadding && 'p-5',
        interactive && 'hover:shadow-md hover:border-stone-300 transition-all duration-150 cursor-pointer',
        onClick && 'w-full text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
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
  readonly icon?: LucideIcon;
  readonly iconClassName?: string;
  readonly title: string;
  readonly subtitle?: string;
  /** Right-side slot for badges, buttons, etc. */
  readonly actions?: React.ReactNode;
  /** Size variant */
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
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
          <h3 className={cn(titleSize, 'text-stone-900 truncate')}>{title}</h3>
          {subtitle && (
            <p className="text-sm text-stone-500 mt-0.5 truncate">{subtitle}</p>
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
  readonly children: React.ReactNode;
  readonly className?: string;
  /** Background tint (default: transparent) */
  readonly tint?: 'none' | 'muted' | 'accent' | 'success' | 'warning' | 'danger';
  /** Show top border */
  readonly border?: boolean;
}

const tintMap = {
  none: '',
  muted: 'bg-stone-50',
  accent: 'bg-blue-50',
  success: 'bg-emerald-50',
  warning: 'bg-amber-50',
  danger: 'bg-red-50',
};

export function CardSection({ children, className, tint = 'none', border = true }: CardSectionProps) {
  return (
    <div className={cn(
      'px-5 py-4',
      border && 'border-t border-stone-100',
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
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: LucideIcon;
  readonly iconClassName?: string;
  readonly actions?: React.ReactNode;
  readonly className?: string;
  /** Heading level (visual only, always renders as div for flexibility) */
  readonly level?: 1 | 2 | 3;
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
    1: 'text-base font-medium tracking-tight',
    2: 'text-lg font-semibold',
    3: 'text-base font-semibold',
  }[level];

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <IconBox icon={Icon} size="lg" className={iconClassName} />}
        <div className="min-w-0">
          <div className={cn(headingStyle, 'text-stone-900')}>{title}</div>
          {subtitle && (
            <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>
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
  readonly icon: LucideIcon;
  /** Tailwind bg/text classes for theming. Default: bg-blue-100 text-blue-600 */
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg';
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
  readonly label: string;
  readonly variant?: StatusVariant;
  readonly className?: string;
  /** Show a pulsing dot indicator */
  readonly dot?: boolean;
}

const statusVariants: Record<StatusVariant, string> = {
  default: 'bg-stone-100 text-stone-600',
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
          variant === 'info' && 'bg-stone-600',
          variant === 'active' && 'bg-stone-600 animate-pulse',
          variant === 'default' && 'bg-stone-400',
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
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: LucideIcon;
  readonly iconRight?: LucideIcon;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
}

const buttonVariantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-stone-800 text-white hover:bg-stone-900 shadow-sm',
  secondary: 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-300',
  ghost: 'text-stone-600 hover:text-stone-900 hover:bg-stone-100',
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
        'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
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
  readonly label: string;
  readonly value: string | number;
  readonly icon?: LucideIcon;
  readonly iconClassName?: string;
  readonly change?: { readonly value: string; readonly positive?: boolean };
  readonly className?: string;
}

export function MetricCard({ label, value, icon: Icon, iconClassName, change, className }: MetricCardProps) {
  return (
    <EnterpriseCard className={cn('flex items-start gap-4', className)}>
      {Icon && <IconBox icon={Icon} className={iconClassName} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-500">{label}</p>
        <p className="text-base font-semibold text-stone-900 mt-1">{value}</p>
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
  readonly label: string;
  readonly value: React.ReactNode;
  readonly className?: string;
}

export function DataRow({ label, value, className }: DataRowProps) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2', className)}>
      <dt className="text-sm text-stone-500 flex-shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-stone-900 text-right truncate">{value}</dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════════════

interface EmptyStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
  readonly className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <div className="w-14 h-14 rounded-lg bg-stone-100 flex items-center justify-center mb-4">
        <Icon size={24} className="text-stone-400" />
      </div>
      <h3 className="text-base font-semibold text-stone-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-stone-500 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION BAR — consistent row of action buttons (card footer)
// ═══════════════════════════════════════════════════════════════════════════════

interface ActionBarProps {
  readonly children: React.ReactNode;
  /** Left-side slot (e.g., secondary actions) */
  readonly left?: React.ReactNode;
  readonly className?: string;
}

export function ActionBar({ children, left, className }: ActionBarProps) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-3 pt-4 border-t border-stone-100',
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
  readonly icon?: LucideIcon;
  readonly iconClassName?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly meta?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly onClick?: () => void;
  readonly className?: string;
  /** Show chevron indicator */
  readonly chevron?: boolean;
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
        onClick && 'cursor-pointer hover:bg-stone-50 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
        className,
      )}
    >
      {Icon && <IconBox icon={Icon} size="sm" className={iconClassName} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-900 truncate">{title}</p>
        {subtitle && <p className="text-xs text-stone-500 truncate mt-0.5">{subtitle}</p>}
      </div>
      {meta && <div className="flex-shrink-0">{meta}</div>}
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      {chevron && <ChevronRight size={16} className="text-stone-400 flex-shrink-0" />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIVIDER
// ═══════════════════════════════════════════════════════════════════════════════

interface DividerProps {
  readonly label?: string;
  readonly className?: string;
}

export function Divider({ label, className }: DividerProps) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3 py-3', className)}>
        <div className="flex-1 h-px bg-stone-200" />
        <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">{label}</span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>
    );
  }
  return <div className={cn('h-px bg-stone-100 my-4', className)} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════════════════

interface ProgressBarProps {
  readonly value: number;
  readonly max?: number;
  readonly variant?: 'default' | 'success' | 'warning' | 'danger';
  readonly size?: 'sm' | 'md';
  readonly showLabel?: boolean;
  readonly className?: string;
}

const progressVariants = {
  default: 'bg-stone-800',
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
        'flex-1 rounded-full bg-stone-100 overflow-hidden',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
      )}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', progressVariants[variant])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-stone-600 tabular-nums w-10 text-right">
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
  readonly className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div role="status" aria-label="Loading" className={cn('animate-pulse rounded-md bg-stone-200', className)} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT — semantic typography components
// ═══════════════════════════════════════════════════════════════════════════════

interface TextProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly as?: 'p' | 'span' | 'div' | 'label';
}

/** Page title — text-base font-medium tracking-tight */
export function PageTitle({ children, className }: TextProps) {
  return <h1 className={cn('text-base font-medium tracking-tight text-stone-900', className)}>{children}</h1>;
}

/** Section heading — text-lg font-semibold. Defaults to h2 for proper document outline. */
export function Heading({ children, className, as: Tag = 'h2' }: TextProps) {
  return <Tag className={cn('text-lg font-semibold text-stone-900', className)}>{children}</Tag>;
}

/** Sub heading — text-base font-semibold. Defaults to h3 for proper document outline. */
export function SubHeading({ children, className, as: Tag = 'h3' }: TextProps) {
  return <Tag className={cn('text-base font-semibold text-stone-900', className)}>{children}</Tag>;
}

/** Label — text-sm font-medium text-stone-700 */
export function Label({ children, className, as: Tag = 'label' }: TextProps) {
  return <Tag className={cn('text-sm font-medium text-stone-700', className)}>{children}</Tag>;
}

/** Body — text-sm text-stone-600 */
export function Body({ children, className, as: Tag = 'p' }: TextProps) {
  return <Tag className={cn('text-sm text-stone-600 leading-relaxed', className)}>{children}</Tag>;
}

/** Caption — text-xs text-stone-500 */
export function Caption({ children, className, as: Tag = 'p' }: TextProps) {
  return <Tag className={cn('text-xs text-stone-500', className)}>{children}</Tag>;
}

/** Overline — text-xs uppercase tracking-wider. Uses stone-500 for WCAG AA contrast. */
export function Overline({ children, className, as: Tag = 'span' }: TextProps) {
  return <Tag className={cn('text-xs font-medium text-stone-500 uppercase tracking-wider', className)}>{children}</Tag>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT — consistent form input
// ═══════════════════════════════════════════════════════════════════════════════

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly icon?: LucideIcon;
  readonly error?: string;
}

export function Input({ icon: Icon, error, className, id: providedId, ...props }: InputProps) {
  const autoId = useId();
  const inputId = providedId ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="relative">
      {Icon && (
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          'w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-stone-900',
          'placeholder:text-stone-400',
          'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 outline-none',
          'transition-colors duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-stone-50',
          Icon && 'pl-10',
          error ? 'border-red-300 focus-visible:ring-red-500' : 'border-stone-200',
          className,
        )}
        {...props}
      />
      {error && <p id={errorId} role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL OVERLAY — consistent backdrop + centered container
// ═══════════════════════════════════════════════════════════════════════════════

interface ModalOverlayProps {
  readonly children: React.ReactNode;
  readonly onClose?: () => void;
  /** Max width of the modal container */
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Accessible label for the dialog */
  readonly ariaLabel?: string;
  readonly className?: string;
}

const modalSizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function ModalOverlay({ children, onClose, size = 'md', ariaLabel, className }: ModalOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // ESC to close + focus trap
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Move focus into dialog on mount
    const previousFocus = document.activeElement as HTMLElement | null;
    const firstFocusable = dialog.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (firstFocusable ?? dialog).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      // Trap Tab within dialog
      if (e.key === 'Tab') {
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus on unmount
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Content */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden',
          'animate-in fade-in zoom-in-95 duration-150',
          modalSizes[size],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE LAYOUT — consistent page-level structure
// ═══════════════════════════════════════════════════════════════════════════════

interface PageLayoutProps {
  readonly children: React.ReactNode;
  /** Max content width */
  readonly size?: 'narrow' | 'normal' | 'wide' | 'full';
  readonly className?: string;
}

const layoutSizes = {
  narrow: 'max-w-3xl',
  normal: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: '',
};

export function PageLayout({ children, size = 'normal', className }: PageLayoutProps) {
  return (
    <div className={cn('min-h-full w-full mx-auto px-6 py-6 space-y-6', layoutSizes[size], className)}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE HEADER — title + subtitle + actions, consistent across all pages
// ═══════════════════════════════════════════════════════════════════════════════

interface PageHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: React.ReactNode;
  readonly className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div>
        <h1 className="text-base font-medium text-stone-900 tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAT ROW — horizontal strip of metrics
// ═══════════════════════════════════════════════════════════════════════════════

interface Stat {
  readonly label: string;
  readonly value: string | number;
  readonly icon?: LucideIcon;
  readonly iconClassName?: string;
  readonly valueClassName?: string;
}

interface StatRowProps {
  readonly stats: readonly Stat[];
  readonly columns?: 2 | 3 | 4 | 5 | 6;
  readonly className?: string;
}

const colMap = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

export function StatRow({ stats, columns = 4, className }: StatRowProps) {
  return (
    <div className={cn('grid gap-4', colMap[columns], className)}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            {s.icon && <s.icon className={cn('h-4 w-4', s.iconClassName || 'text-stone-500')} />}
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">{s.label}</span>
          </div>
          <span className={cn('text-base font-semibold mt-1 block', s.valueClassName || 'text-stone-900')}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB BAR — consistent horizontal tab strip
// ═══════════════════════════════════════════════════════════════════════════════

interface Tab {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly count?: number;
}

interface TabBarProps {
  readonly tabs: readonly Tab[];
  readonly activeTab: string;
  readonly onTabChange: (id: string) => void;
  readonly className?: string;
}

export function TabBar({ tabs, activeTab, onTabChange, className }: TabBarProps) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-stone-200', className)}>
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
              active
                ? 'border-stone-800 text-blue-600'
                : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300',
            )}
          >
            {Icon && <Icon size={16} />}
            {tab.label}
            {tab.count != null && (
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5 font-medium',
                active ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-500',
              )}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL ARTIFACT LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════
//
// ONE lifecycle. ONE color map. Used EVERYWHERE.
//
// Domain-specific extensions (SOP effective/retired, 510k RTA_HOLD, etc.)
// map INTO these canonical stages — they don't replace them.
// ═══════════════════════════════════════════════════════════════════════════════

/** The universal artifact lifecycle stages */
export type ArtifactLifecycleStage =
  | 'not_started'
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'superseded'
  | 'archived';

/** Visual config for each lifecycle stage */
export interface LifecycleStageConfig {
  label: string;
  variant: StatusVariant;
  bg: string;
  text: string;
  dot: string;
  border: string;
  /** Sort order for consistent ordering */
  order: number;
}

export const LIFECYCLE: Record<ArtifactLifecycleStage, LifecycleStageConfig> = {
  not_started: {
    label: 'Not Started',
    variant: 'default',
    bg: 'bg-stone-50',
    text: 'text-stone-600',
    dot: 'bg-stone-400',
    border: 'border-stone-200',
    order: 0,
  },
  draft: {
    label: 'Draft',
    variant: 'warning',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    order: 1,
  },
  in_review: {
    label: 'In Review',
    variant: 'info',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-stone-600',
    border: 'border-blue-200',
    order: 2,
  },
  approved: {
    label: 'Approved',
    variant: 'success',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200',
    order: 3,
  },
  published: {
    label: 'Published',
    variant: 'success',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    dot: 'bg-emerald-600',
    border: 'border-emerald-300',
    order: 4,
  },
  superseded: {
    label: 'Superseded',
    variant: 'purple',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    dot: 'bg-purple-500',
    border: 'border-purple-200',
    order: 5,
  },
  archived: {
    label: 'Archived',
    variant: 'default',
    bg: 'bg-stone-50',
    text: 'text-stone-500',
    dot: 'bg-stone-400',
    border: 'border-stone-200',
    order: 6,
  },
};

/**
 * Map any domain-specific status string to the canonical lifecycle stage.
 * Handles hyphens, underscores, uppercase, and domain-specific values.
 */
export function toLifecycleStage(status: string): ArtifactLifecycleStage {
  const s = status.toLowerCase().replace(/-/g, '_');
  // Direct matches
  if (s in LIFECYCLE) return s as ArtifactLifecycleStage;
  // Domain-specific mappings
  const MAP: Record<string, ArtifactLifecycleStage> = {
    // Authoring/IND stages
    drafting: 'draft',
    first_draft: 'draft',
    outline: 'draft',
    not_started: 'not_started',
    // Review variants
    review: 'in_review',
    in_review: 'in_review',
    internal_review: 'in_review',
    cross_functional_review: 'in_review',
    sme_review: 'in_review',
    qa_compliance_review: 'in_review',
    sponsor_review: 'in_review',
    author_self_check: 'in_review',
    internal_functional_review: 'in_review',
    under_review: 'in_review',
    pending_approval: 'in_review',
    sponsor_approval_pending: 'in_review',
    revision: 'in_review',
    changes_requested: 'in_review',
    final_qc: 'in_review',
    final_approval: 'in_review',
    qc: 'in_review',
    // Approval variants
    approved: 'approved',
    locked: 'approved',
    effective: 'approved',
    ready: 'approved',
    final: 'approved',
    ready_for_submission: 'approved',
    // Published variants
    published: 'published',
    publishing_prep: 'published',
    submitted: 'published',
    // Terminal variants
    superseded: 'superseded',
    retired: 'superseded',
    reopened: 'draft',
    // Archived
    archived: 'archived',
  };
  return MAP[s] ?? 'not_started';
}

/**
 * Get the StatusPill variant for any domain-specific status string.
 */
export function lifecycleVariant(status: string): StatusVariant {
  return LIFECYCLE[toLifecycleStage(status)].variant;
}

/**
 * Get the display label for any domain-specific status string.
 */
export function lifecycleLabel(status: string): string {
  return LIFECYCLE[toLifecycleStage(status)].label;
}

/**
 * Render a StatusPill for any artifact status.
 * Drop-in replacement for ad-hoc status badges across the app.
 */
export function LifecyclePill({ status, dot, className }: {
  status: string;
  dot?: boolean;
  className?: string;
}) {
  const stage = toLifecycleStage(status);
  const config = LIFECYCLE[stage];
  return (
    <StatusPill
      label={config.label}
      variant={config.variant}
      dot={dot}
      className={className}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING STATE — accessible, consistent loading indicator
// ═══════════════════════════════════════════════════════════════════════════════

interface LoadingStateProps {
  /** What is loading — shown to screen readers and as visible text */
  readonly label?: string;
  /** Compact: inline spinner. Full: centered section with text. */
  readonly size?: 'compact' | 'section' | 'page';
  readonly className?: string;
}

export function LoadingState({ label = 'Loading', size = 'section', className }: LoadingStateProps) {
  if (size === 'compact') {
    return (
      <span role="status" className={cn('inline-flex items-center gap-2 text-xs text-stone-500', className)}>
        <span className="w-3.5 h-3.5 rounded-full border-2 border-stone-200 border-t-stone-500 animate-spin" />
        <span>{label}</span>
      </span>
    );
  }

  if (size === 'page') {
    return (
      <div role="status" className={cn('flex-1 flex flex-col items-center justify-center bg-white gap-3 min-h-[300px]', className)}>
        <div className="w-6 h-6 rounded-full border-2 border-stone-200 border-t-stone-500 animate-spin" />
        <span className="text-sm text-stone-500">{label}</span>
      </div>
    );
  }

  // section (default)
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center py-12 gap-3', className)}>
      <div className="w-5 h-5 rounded-full border-2 border-stone-200 border-t-stone-500 animate-spin" />
      <span className="text-sm text-stone-500">{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL SEVERITY / PRIORITY
// ═══════════════════════════════════════════════════════════════════════════════
//
// Single source of truth for severity/priority/impact colors across the entire
// platform. Every risk cockpit, alert feed, gap analysis, CAPA, inspection
// readiness, and program analytics panel MUST derive colors from here.
//
// Four levels: critical → high → medium → low
// Consistent palette: red → orange → amber → blue

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

interface SeverityConfig {
  readonly label: string;
  /** Pill variant from StatusPill */
  readonly variant: 'danger' | 'warning' | 'warning' | 'info';
  /** Background for cards / badges */
  readonly bg: string;
  /** Text color */
  readonly text: string;
  /** Dot / indicator color */
  readonly dot: string;
  /** Border color */
  readonly border: string;
  /** Sort order (0 = most severe) */
  readonly order: number;
}

export const SEVERITY: Record<SeverityLevel, SeverityConfig> = {
  critical: { label: 'Critical', variant: 'danger',  bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    border: 'border-red-200',    order: 0 },
  high:     { label: 'High',     variant: 'warning', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200', order: 1 },
  medium:   { label: 'Medium',   variant: 'warning', bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200',  order: 2 },
  low:      { label: 'Low',      variant: 'info',    bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-stone-600',   border: 'border-blue-200',   order: 3 },
};

/** Normalise any severity/priority/impact string to a canonical level */
export function toSeverityLevel(raw: string): SeverityLevel {
  const s = raw.toLowerCase().replace(/[_-]/g, '');
  if (s === 'critical' || s === 'p0' || s === 'blocker') return 'critical';
  if (s === 'high' || s === 'major' || s === 'p1' || s === 'urgent') return 'high';
  if (s === 'medium' || s === 'moderate' || s === 'p2' || s === 'minor') return 'medium';
  if (s === 'low' || s === 'info' || s === 'p3' || s === 'trivial' || s === 'observation') return 'low';
  return 'medium'; // safe default
}

// Re-export for convenience
export { cn };
