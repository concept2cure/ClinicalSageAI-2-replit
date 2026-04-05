/**
 * Concept2Cure Design System - Empty State
 *
 * Beautiful empty states that guide users to take action.
 * Inspired by the thoughtful, helpful nature of Claude.AI.
 *
 * @version 3.0.0
 */

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FileText, FolderOpen, Search, Plus, Sparkles, Inbox, type LucideIcon } from 'lucide-react';
import { colors } from '../tokens';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmptyStateProps {
  /** Main heading */
  title: string;
  /** Supporting description */
  description?: string;
  /** Icon to display */
  icon?: LucideIcon;
  /** Custom illustration/icon element */
  illustration?: React.ReactNode;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  /** Secondary action */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Visual style */
  variant?: 'default' | 'minimal' | 'illustrated';
  /** Additional class names */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT ILLUSTRATION
// ═══════════════════════════════════════════════════════════════════════════════

const DefaultIllustration: React.FC<{ icon?: LucideIcon }> = ({ icon: Icon = Inbox }) => (
  <div className="relative">
    {/* Background circles */}
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary-50 to-accent-50" />
    </motion.div>
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-100 to-accent-100" />
    </motion.div>

    {/* Icon */}
    <motion.div
      className="relative flex items-center justify-center w-32 h-32"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.3, type: 'spring', stiffness: 200 }}
    >
      <div className="w-16 h-16 rounded-2xl bg-white shadow-sm shadow-primary-500/10 flex items-center justify-center">
        <Icon className="w-8 h-8 text-primary-600" />
      </div>
    </motion.div>

    {/* Floating particles */}
    {[...Array(3)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-2 h-2 rounded-full bg-primary-300"
        style={{
          top: `${20 + i * 25}%`,
          left: `${10 + i * 30}%`,
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: [0, 1, 0.8],
          opacity: [0, 0.6, 0.3],
          y: [0, -5, 0],
        }}
        transition={{
          duration: 2,
          delay: 0.5 + i * 0.2,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
      />
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════════════

const SearchIllustration: React.FC = () => (
  <div className="relative flex items-center justify-center w-32 h-32">
    <motion.div
      className="absolute w-20 h-20 rounded-full border-4 border-neutral-200"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    />
    <motion.div
      className="absolute w-4 h-12 bg-neutral-200 rounded-full origin-top"
      style={{
        transform: 'rotate(45deg)',
        top: '60%',
        left: '60%',
      }}
      initial={{ scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
    />
    <Search className="w-8 h-8 text-neutral-400" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const EmptyState: React.FC<EmptyStateProps> = memo(
  ({
    title,
    description,
    icon,
    illustration,
    action,
    secondaryAction,
    size = 'md',
    variant = 'default',
    className,
  }) => {
    // Size configuration
    const sizeConfig = {
      sm: {
        container: 'py-8 px-6',
        iconWrapper: 'w-12 h-12',
        iconSize: 'w-6 h-6',
        title: 'text-base',
        description: 'text-sm',
        button: 'px-3 py-1.5 text-sm',
      },
      md: {
        container: 'py-12 px-8',
        iconWrapper: 'w-16 h-16',
        iconSize: 'w-8 h-8',
        title: 'text-lg',
        description: 'text-base',
        button: 'px-4 py-2 text-sm',
      },
      lg: {
        container: 'py-16 px-10',
        iconWrapper: 'w-20 h-20',
        iconSize: 'w-10 h-10',
        title: 'text-xl',
        description: 'text-base',
        button: 'px-5 py-2.5 text-base',
      },
    };

    const config = sizeConfig[size];
    const Icon = icon || Inbox;
    const ActionIcon = action?.icon || Plus;

    return (
      <motion.div
        className={cn(
          'flex flex-col items-center justify-center text-center',
          config.container,
          variant === 'minimal'
            ? ''
            : 'rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50',
          className
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Illustration */}
        {variant === 'illustrated' && (
          <div className="mb-6">{illustration || <DefaultIllustration icon={icon} />}</div>
        )}

        {/* Simple Icon (non-illustrated) */}
        {variant !== 'illustrated' && (
          <motion.div
            className={cn(
              'flex items-center justify-center rounded-2xl mb-4',
              config.iconWrapper,
              'bg-neutral-100'
            )}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Icon className={cn(config.iconSize, 'text-neutral-400')} />
          </motion.div>
        )}

        {/* Title */}
        <h3 className={cn('font-semibold text-neutral-900 mb-1', config.title)}>{title}</h3>

        {/* Description */}
        {description && (
          <p className={cn('text-neutral-500 max-w-sm', config.description)}>{description}</p>
        )}

        {/* Actions */}
        {(action || secondaryAction) && (
          <div className="flex items-center gap-3 mt-6">
            {action && (
              <motion.button
                onClick={action.onClick}
                className={cn(
                  'inline-flex items-center gap-2 font-medium rounded-lg',
                  'bg-primary-600 text-white',
                  'hover:bg-primary-700',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                  'transition-colors duration-150',
                  config.button
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <ActionIcon className="w-4 h-4" />
                {action.label}
              </motion.button>
            )}
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                className={cn(
                  'font-medium text-neutral-600 hover:text-neutral-900',
                  'transition-colors duration-150',
                  config.button
                )}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

// ═══════════════════════════════════════════════════════════════════════════════
// PRESET EMPTY STATES
// ═══════════════════════════════════════════════════════════════════════════════

export const NoDocumentsEmptyState: React.FC<{
  onUpload?: () => void;
  className?: string;
}> = ({ onUpload, className }) => (
  <EmptyState
    icon={FileText}
    title="No documents yet"
    description="Upload your first document to get started with regulatory intelligence."
    action={
      onUpload
        ? {
            label: 'Upload Document',
            onClick: onUpload,
            icon: Plus,
          }
        : undefined
    }
    variant="illustrated"
    className={className}
  />
);

export const NoSearchResultsEmptyState: React.FC<{
  query?: string;
  onClear?: () => void;
  className?: string;
}> = ({ query, onClear, className }) => (
  <EmptyState
    icon={Search}
    title="No results found"
    description={
      query
        ? `We couldn't find anything matching "${query}". Try adjusting your search.`
        : 'Try adjusting your search or filters.'
    }
    secondaryAction={
      onClear
        ? {
            label: 'Clear search',
            onClick: onClear,
          }
        : undefined
    }
    variant="minimal"
    className={className}
  />
);

export const NoDataEmptyState: React.FC<{
  title?: string;
  description?: string;
  className?: string;
}> = ({ title, description, className }) => (
  <EmptyState
    icon={FolderOpen}
    title={title || 'No data available'}
    description={description || "Data will appear here once it's available."}
    variant="minimal"
    size="sm"
    className={className}
  />
);

export const AIWelcomeEmptyState: React.FC<{
  onStartConversation?: () => void;
  className?: string;
}> = ({ onStartConversation, className }) => (
  <EmptyState
    icon={Sparkles}
    title="How can I help you today?"
    description="I'm your regulatory intelligence assistant. Ask me about compliance, submissions, or document analysis."
    action={
      onStartConversation
        ? {
            label: 'Start a conversation',
            onClick: onStartConversation,
            icon: Sparkles,
          }
        : undefined
    }
    variant="illustrated"
    className={className}
  />
);

export default EmptyState;
