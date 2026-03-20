/**
 * Concept2Cure Design System - Conversation Bubble
 *
 * Elegant message bubbles for AI assistant and chat interfaces.
 * Inspired by Claude.AI's clean, readable conversation style.
 *
 * @version 3.0.0
 */

import React, { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  User,
  BookOpen,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { colors, typography, spacing, borderRadius, shadows, transitions } from '../tokens';
import { motionVariants } from '../motion';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Citation {
  id: string;
  title: string;
  source: string;
  excerpt?: string;
  url?: string;
  confidence?: number;
}

export interface ConversationBubbleProps {
  /** The message content - can be plain text or markdown */
  content: string;
  /** Who sent the message */
  role: 'user' | 'assistant' | 'system';
  /** When the message was sent */
  timestamp?: Date;
  /** Citations/sources for assistant responses */
  citations?: Citation[];
  /** Whether the message is still being streamed */
  isStreaming?: boolean;
  /** Callback when user copies the message */
  onCopy?: () => void;
  /** Callback for feedback */
  onFeedback?: (type: 'positive' | 'negative') => void;
  /** Callback to regenerate response */
  onRegenerate?: () => void;
  /** Whether to show the avatar */
  showAvatar?: boolean;
  /** Custom avatar content */
  avatar?: React.ReactNode;
  /** Error state */
  error?: string;
  /** Additional class names */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1 py-2">
    {[0, 1, 2].map(i => (
      <motion.span
        key={i}
        className="w-2 h-2 rounded-full bg-neutral-400"
        animate={{
          y: [0, -4, 0],
          opacity: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 0.6,
          repeat: Infinity,
          delay: i * 0.15,
          ease: 'easeInOut',
        }}
      />
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// CITATION CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface CitationCardProps {
  citation: Citation;
  index: number;
}

const CitationCard: React.FC<CitationCardProps> = memo(({ citation, index }) => (
  <motion.a
    href={citation.url}
    target="_blank"
    rel="noopener noreferrer"
    className={cn(
      'group flex flex-col gap-1.5 p-3 rounded-lg',
      'bg-neutral-50 hover:bg-neutral-100',
      'border border-neutral-200 hover:border-neutral-300',
      'transition-all duration-200',
      'cursor-pointer'
    )}
    whileHover={{ y: -1 }}
    whileTap={{ scale: 0.99 }}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded text-xs font-medium bg-primary-100 text-primary-700">
          {index + 1}
        </span>
        <span className="text-sm font-medium text-neutral-900 line-clamp-1 group-hover:text-primary-600 transition-colors">
          {citation.title}
        </span>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-primary-500 flex-shrink-0 transition-colors" />
    </div>
    {citation.excerpt && (
      <p className="text-xs text-neutral-500 line-clamp-2 pl-7">{citation.excerpt}</p>
    )}
    <div className="flex items-center gap-2 pl-7">
      <span className="text-xs text-neutral-400">{citation.source}</span>
      {citation.confidence !== undefined && (
        <span
          className={cn(
            'text-xs px-1.5 py-0.5 rounded',
            citation.confidence >= 0.8
              ? 'bg-success-50 text-success-700'
              : citation.confidence >= 0.5
                ? 'bg-warning-50 text-warning-700'
                : 'bg-neutral-100 text-neutral-600'
          )}
        >
          {Math.round(citation.confidence * 100)}% match
        </span>
      )}
    </div>
  </motion.a>
));

CitationCard.displayName = 'CitationCard';

// ═══════════════════════════════════════════════════════════════════════════════
// BUBBLE ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

interface BubbleActionsProps {
  onCopy?: () => void;
  onFeedback?: (type: 'positive' | 'negative') => void;
  onRegenerate?: () => void;
  copied: boolean;
  feedbackGiven?: 'positive' | 'negative' | null;
}

const BubbleActions: React.FC<BubbleActionsProps> = memo(
  ({ onCopy, onFeedback, onRegenerate, copied, feedbackGiven }) => (
    <motion.div
      className="flex items-center gap-1 mt-2 pt-2 border-t border-neutral-100"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
    >
      {onCopy && (
        <button
          onClick={onCopy}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
            'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100',
            'transition-colors duration-150'
          )}
          aria-label={copied ? 'Copied' : 'Copy message'}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-success-600" />
              <span className="text-success-600">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      )}

      {onFeedback && (
        <>
          <button
            onClick={() => onFeedback('positive')}
            className={cn(
              'p-1.5 rounded-md transition-colors duration-150',
              feedbackGiven === 'positive'
                ? 'bg-success-50 text-success-600'
                : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
            )}
            aria-label="Helpful"
            aria-pressed={feedbackGiven === 'positive'}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onFeedback('negative')}
            className={cn(
              'p-1.5 rounded-md transition-colors duration-150',
              feedbackGiven === 'negative'
                ? 'bg-error-50 text-error-600'
                : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
            )}
            aria-label="Not helpful"
            aria-pressed={feedbackGiven === 'negative'}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ml-auto',
            'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100',
            'transition-colors duration-150'
          )}
          aria-label="Regenerate response"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      )}
    </motion.div>
  )
);

BubbleActions.displayName = 'BubbleActions';

// ═══════════════════════════════════════════════════════════════════════════════
// AVATAR
// ═══════════════════════════════════════════════════════════════════════════════

interface AvatarProps {
  role: 'user' | 'assistant' | 'system';
  custom?: React.ReactNode;
}

const Avatar: React.FC<AvatarProps> = ({ role, custom }) => {
  if (custom) return <>{custom}</>;

  const config = {
    user: {
      bg: 'bg-neutral-200',
      icon: <User className="w-4 h-4 text-neutral-600" />,
    },
    assistant: {
      bg: 'bg-gradient-to-br from-primary-500 to-accent-500',
      icon: <Sparkles className="w-4 h-4 text-white" />,
    },
    system: {
      bg: 'bg-neutral-100',
      icon: <AlertCircle className="w-4 h-4 text-neutral-500" />,
    },
  };

  const { bg, icon } = config[role];

  return (
    <div className={cn('flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0', bg)}>
      {icon}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ConversationBubble: React.FC<ConversationBubbleProps> = memo(
  ({
    content,
    role,
    timestamp,
    citations,
    isStreaming = false,
    onCopy,
    onFeedback,
    onRegenerate,
    showAvatar = true,
    avatar,
    error,
    className,
  }) => {
    const [copied, setCopied] = useState(false);
    const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null);
    const [showCitations, setShowCitations] = useState(false);

    const isUser = role === 'user';
    const isAssistant = role === 'assistant';

    const handleCopy = useCallback(async () => {
      if (!onCopy) return;

      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        onCopy();
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }, [content, onCopy]);

    const handleFeedback = useCallback(
      (type: 'positive' | 'negative') => {
        setFeedbackGiven(type);
        onFeedback?.(type);
      },
      [onFeedback]
    );

    const formatTime = (date: Date) => {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      }).format(date);
    };

    return (
      <motion.div
        className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row', className)}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Avatar */}
        {showAvatar && (
          <div className={cn('mt-1', isUser && 'order-1')}>
            <Avatar role={role} custom={avatar} />
          </div>
        )}

        {/* Bubble Container */}
        <div className={cn('flex flex-col max-w-[80%]', isUser ? 'items-end' : 'items-start')}>
          {/* Main Bubble */}
          <div
            className={cn(
              'relative rounded-2xl px-4 py-3',
              isUser
                ? 'bg-primary-600 text-white rounded-br-md'
                : 'bg-neutral-100 text-neutral-900 rounded-bl-md',
              error && 'border-2 border-error-300 bg-error-50'
            )}
          >
            {/* Content */}
            {isStreaming && !content ? (
              <TypingIndicator />
            ) : (
              <div
                className={cn(
                  'prose prose-sm max-w-none',
                  isUser && 'prose-invert',
                  'leading-relaxed'
                )}
              >
                {error ? (
                  <div className="flex items-center gap-2 text-error-600">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </div>
                ) : (
                  <p className="m-0 whitespace-pre-wrap">{content}</p>
                )}
              </div>
            )}

            {/* Streaming cursor */}
            {isStreaming && content && (
              <motion.span
                className="inline-block w-0.5 h-4 ml-0.5 bg-current align-middle"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
              />
            )}

            {/* Citations Toggle */}
            {isAssistant && citations && citations.length > 0 && !isStreaming && (
              <button
                onClick={() => setShowCitations(!showCitations)}
                className={cn(
                  'flex items-center gap-1.5 mt-3 pt-2 border-t border-neutral-200/50',
                  'text-xs text-neutral-500 hover:text-neutral-700',
                  'transition-colors duration-150'
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>
                  {citations.length} source{citations.length !== 1 ? 's' : ''}
                </span>
                {showCitations ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Citations Panel */}
          <AnimatePresence>
            {showCitations && citations && citations.length > 0 && (
              <motion.div
                className="w-full mt-2 space-y-2"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                {citations.map((citation, index) => (
                  <CitationCard key={citation.id} citation={citation} index={index} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions (Assistant only) */}
          {isAssistant && !isStreaming && !error && (
            <BubbleActions
              onCopy={onCopy ? handleCopy : undefined}
              onFeedback={onFeedback ? handleFeedback : undefined}
              onRegenerate={onRegenerate}
              copied={copied}
              feedbackGiven={feedbackGiven}
            />
          )}

          {/* Timestamp */}
          {timestamp && !isStreaming && (
            <span
              className={cn('text-xs text-neutral-400 mt-1', isUser ? 'text-right' : 'text-left')}
            >
              {formatTime(timestamp)}
            </span>
          )}
        </div>
      </motion.div>
    );
  }
);

ConversationBubble.displayName = 'ConversationBubble';

export default ConversationBubble;
