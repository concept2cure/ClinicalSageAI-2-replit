import React from 'react';
import { FileQuestion, FolderX, SearchX, AlertCircle, Inbox } from 'lucide-react';

/**
 * EmptyState Component
 * 
 * Displays a centered empty state with icon, title, description, and optional action button.
 * 
 * Props:
 * - icon: Lucide icon component (default: Inbox)
 * - title: string (required)
 * - description: string (optional)
 * - actionLabel: string (optional)
 * - onAction: function (optional)
 * - variant: 'default' | 'search' | 'error' | 'info'
 */

const variantStyles = {
  default: {
    iconColor: 'text-slate-400',
    titleColor: 'text-slate-700',
    descColor: 'text-slate-500',
  },
  search: {
    iconColor: 'text-indigo-400',
    titleColor: 'text-slate-700',
    descColor: 'text-slate-500',
  },
  error: {
    iconColor: 'text-rose-400',
    titleColor: 'text-rose-700',
    descColor: 'text-rose-600',
  },
  info: {
    iconColor: 'text-blue-400',
    titleColor: 'text-slate-700',
    descColor: 'text-slate-500',
  },
};

const variantIcons = {
  default: Inbox,
  search: SearchX,
  error: AlertCircle,
  info: FileQuestion,
};

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  variant = 'default',
}) {
  const Icon = icon || variantIcons[variant];
  const styles = variantStyles[variant] || variantStyles.default;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Icon className={`h-16 w-16 mb-4 ${styles.iconColor}`} />
      <h3 className={`text-lg font-semibold mb-2 ${styles.titleColor}`}>
        {title}
      </h3>
      {description && (
        <p className={`text-sm mb-6 max-w-md ${styles.descColor}`}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all duration-150 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// Preset variants for common use cases
export function NoResultsState({ searchTerm, onClear }) {
  return (
    <EmptyState
      variant="search"
      title="No results found"
      description={searchTerm ? `No matches for "${searchTerm}". Try adjusting your filters or search terms.` : "Try adjusting your filters or search terms."}
      actionLabel={onClear ? "Clear filters" : undefined}
      onAction={onClear}
    />
  );
}

export function NoDataState({ title, description, actionLabel, onAction }) {
  return (
    <EmptyState
      variant="default"
      title={title || "No items yet"}
      description={description || "Get started by adding your first item."}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

export function ErrorState({ title, description, actionLabel, onAction }) {
  return (
    <EmptyState
      variant="error"
      title={title || "Something went wrong"}
      description={description || "An error occurred while loading this content. Please try again."}
      actionLabel={actionLabel || "Retry"}
      onAction={onAction}
    />
  );
}
