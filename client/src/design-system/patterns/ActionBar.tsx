/**
 * Concept2Cure Design System - Action Bar
 *
 * Elegant action bars for page headers and contextual actions.
 * Clean, minimal design with smart responsive behavior.
 *
 * @version 3.0.0
 */

import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Search,
  Filter,
  Plus,
  Download,
  Upload,
  MoreHorizontal,
  ChevronDown,
  X,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { colors } from '../tokens';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActionBarProps {
  /** Page/section title */
  title?: string;
  /** Subtitle or description */
  subtitle?: string;
  /** Breadcrumb items */
  breadcrumbs?: Array<{
    label: string;
    href?: string;
    onClick?: () => void;
  }>;
  /** Primary action button */
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
    loading?: boolean;
    disabled?: boolean;
  };
  /** Secondary actions */
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
    variant?: 'default' | 'outline' | 'ghost';
    disabled?: boolean;
  }>;
  /** Search configuration */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    onSubmit?: () => void;
  };
  /** Filter badge count */
  filterCount?: number;
  /** Filter button click */
  onFilterClick?: () => void;
  /** View toggle options */
  viewToggle?: {
    options: Array<{ id: string; icon: LucideIcon; label: string }>;
    value: string;
    onChange: (id: string) => void;
  };
  /** Sticky positioning */
  sticky?: boolean;
  /** Additional class names */
  className?: string;
  /** Children for custom content */
  children?: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH INPUT
// ═══════════════════════════════════════════════════════════════════════════════

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  className?: string;
}

const SearchInput: React.FC<SearchInputProps> = memo(
  ({ value, onChange, placeholder = 'Search...', onSubmit, className }) => {
    const [focused, setFocused] = useState(false);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && onSubmit) {
        onSubmit();
      }
      if (e.key === 'Escape') {
        onChange('');
      }
    };

    return (
      <div className={cn('relative flex items-center', 'w-full max-w-xs', className)}>
        <div
          className={cn(
            'relative flex items-center w-full rounded-lg',
            'bg-neutral-100 border border-transparent',
            'transition-all duration-200',
            focused && 'bg-white border-neutral-300 ring-2 ring-primary-500/20'
          )}
        >
          <Search className="absolute left-3 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              'w-full pl-9 pr-8 py-2 text-sm',
              'bg-transparent border-none outline-none',
              'text-neutral-900 placeholder:text-neutral-400'
            )}
          />
          <AnimatePresence>
            {value && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => onChange('')}
                className="absolute right-2 p-1 rounded hover:bg-neutral-200 transition-colors"
              >
                <X className="w-3 h-3 text-neutral-500" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

interface ViewToggleProps {
  options: Array<{ id: string; icon: LucideIcon; label: string }>;
  value: string;
  onChange: (id: string) => void;
}

const ViewToggle: React.FC<ViewToggleProps> = memo(({ options, value, onChange }) => (
  <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
    {options.map(option => {
      const Icon = option.icon;
      const isActive = value === option.id;

      return (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'relative flex items-center justify-center w-8 h-8 rounded-md',
            'transition-colors duration-150',
            isActive ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
          )}
          title={option.label}
        >
          {isActive && (
            <motion.div
              layoutId="viewToggleIndicator"
              className="absolute inset-0 bg-white rounded-md shadow-sm"
              transition={{ duration: 0.15, ease: 'easeOut' }}
            />
          )}
          <Icon className="relative w-4 h-4" />
        </button>
      );
    })}
  </div>
));

ViewToggle.displayName = 'ViewToggle';

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = memo(
  ({
    label,
    onClick,
    icon: Icon,
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled = false,
  }) => {
    const variants = {
      primary: cn('bg-primary-600 text-white', 'hover:bg-primary-700', 'focus:ring-primary-500'),
      secondary: cn(
        'bg-neutral-100 text-neutral-700',
        'hover:bg-neutral-200',
        'focus:ring-neutral-500'
      ),
      outline: cn(
        'bg-white text-neutral-700 border border-neutral-300',
        'hover:bg-neutral-50 hover:border-neutral-400',
        'focus:ring-neutral-500'
      ),
      ghost: cn(
        'bg-transparent text-neutral-600',
        'hover:bg-neutral-100',
        'focus:ring-neutral-500'
      ),
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
    };

    return (
      <motion.button
        onClick={onClick}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-lg',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'transition-colors duration-150',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size]
        )}
        whileHover={!disabled ? { scale: 1.02 } : undefined}
        whileTap={!disabled ? { scale: 0.98 } : undefined}
      >
        {loading ? (
          <motion.div
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        ) : Icon ? (
          <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        ) : null}
        <span>{label}</span>
      </motion.button>
    );
  }
);

ActionButton.displayName = 'ActionButton';

// ═══════════════════════════════════════════════════════════════════════════════
// BREADCRUMBS
// ═══════════════════════════════════════════════════════════════════════════════

interface BreadcrumbsProps {
  items: Array<{
    label: string;
    href?: string;
    onClick?: () => void;
  }>;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = memo(({ items }) => (
  <nav className="flex items-center gap-1 text-sm">
    {items.map((item, index) => (
      <React.Fragment key={index}>
        {index > 0 && <span className="text-neutral-300">/</span>}
        {item.onClick || item.href ? (
          <button
            onClick={item.onClick}
            className="text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            {item.label}
          </button>
        ) : (
          <span
            className={cn(
              index === items.length - 1 ? 'text-neutral-900 font-medium' : 'text-neutral-500'
            )}
          >
            {item.label}
          </span>
        )}
      </React.Fragment>
    ))}
  </nav>
));

Breadcrumbs.displayName = 'Breadcrumbs';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ActionBar: React.FC<ActionBarProps> = memo(
  ({
    title,
    subtitle,
    breadcrumbs,
    primaryAction,
    secondaryActions,
    search,
    filterCount,
    onFilterClick,
    viewToggle,
    sticky = false,
    className,
    children,
  }) => {
    return (
      <div
        className={cn(
          'flex flex-col gap-4 pb-4',
          sticky &&
            'sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-6 px-6 pt-4 border-b border-neutral-100',
          className
        )}
      >
        {/* Top row: Title & Primary Actions */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: Title area */}
          <div className="flex-1 min-w-0">
            {breadcrumbs && breadcrumbs.length > 0 && (
              <div className="mb-1">
                <Breadcrumbs items={breadcrumbs} />
              </div>
            )}
            {title && (
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight truncate">
                {title}
              </h1>
            )}
            {subtitle && <p className="text-sm text-neutral-500 mt-0.5 truncate">{subtitle}</p>}
          </div>

          {/* Right: Primary action */}
          {primaryAction && (
            <ActionButton {...primaryAction} icon={primaryAction.icon || Plus} variant="primary" />
          )}
        </div>

        {/* Bottom row: Search, Filters, Secondary Actions */}
        {(search || secondaryActions || onFilterClick || viewToggle || children) && (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left: Search & Filters */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {search && (
                <SearchInput {...search} placeholder={search.placeholder || 'Search...'} />
              )}

              {onFilterClick && (
                <button
                  onClick={onFilterClick}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
                    'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                    'transition-colors duration-150',
                    filterCount &&
                      filterCount > 0 &&
                      'bg-primary-50 text-primary-700 hover:bg-primary-100'
                  )}
                >
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                  {filterCount !== undefined && filterCount > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 text-xs bg-primary-600 text-white rounded-full">
                      {filterCount}
                    </span>
                  )}
                </button>
              )}

              {children}
            </div>

            {/* Right: Secondary Actions & View Toggle */}
            <div className="flex items-center gap-2">
              {secondaryActions?.map((action, index) => (
                <ActionButton
                  key={index}
                  {...action}
                  variant={
                    action.variant === 'outline'
                      ? 'outline'
                      : action.variant === 'ghost'
                        ? 'ghost'
                        : 'secondary'
                  }
                  size="sm"
                />
              ))}

              {viewToggle && <ViewToggle {...viewToggle} />}
            </div>
          </div>
        )}
      </div>
    );
  }
);

ActionBar.displayName = 'ActionBar';

export default ActionBar;
