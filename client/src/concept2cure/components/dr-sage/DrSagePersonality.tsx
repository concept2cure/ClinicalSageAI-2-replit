import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DrSageGreetingProps {
  userProgress?: {
    modulesCompleted: number;
    totalModules: number;
    activePath?: string;
    streak?: number;
  };
  currentContext?: {
    screenName?: string;
    productType?: string;
    projectName?: string;
  };
  className?: string;
}

interface MessageBubbleProps {
  text: string;
  typing?: boolean;
  actions?: { label: string; onClick: () => void }[];
  className?: string;
}

interface DrSageStatusIndicatorProps {
  status: 'watching' | 'issue-detected' | 'suggestion';
  message: string;
}

interface ContextualTipProps {
  tip: string;
  onDismiss: () => void;
  onExpand?: () => void;
  autoHide?: number;
}

interface QuickActionProps {
  actions: { label: string; icon: React.ReactNode; onClick: () => void }[];
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const DR_SAGE_FUN_FACTS = [
  'The average 510(k) submission references 12 predicate devices. AnA 1.0 can analyze all of them in seconds.',
  'FDA issues roughly 4,000 510(k) clearances per year. Concept2Cure helps you be among them.',
  'A typical IND application contains 50,000+ pages. Governed workflows reduce errors by up to 40%.',
  'The most common FDA deficiency letter topic is insufficient predicate comparison data.',
  'ICH E6(R2) updated GCP guidelines affect every clinical submission. AnA 1.0 tracks changes automatically.',
  'Module 2.7 Clinical Summary is the most frequently missing section in IND submissions.',
  'Post-market surveillance generates 3x more data than pre-market. Concept2Cure handles both.',
  'The average time from IND to NDA is 8 years. Better regulatory intelligence can shorten each phase.',
];

export const DR_SAGE_TIPS = [
  'Try asking AnA 1.0 to compare your evidence coverage against recent FDA acceptances.',
  'Use the provenance inspector to verify traceability before audit.',
  'Run a gap analysis early — finding issues at filing is expensive.',
  'The compliance checklist auto-updates when regulatory authority requirements change.',
  'Version compare highlights semantic changes, not just text diffs.',
  'Dossier placement validates section assignments against eCTD structure rules.',
  'Custom instructions let you tune AnA 1.0 for your specific submission type.',
  'Mission Control provides a single view across all active submissions.',
];

// ---------------------------------------------------------------------------
// getGreetingMessage
// ---------------------------------------------------------------------------

export function getGreetingMessage(
  currentContext?: DrSageGreetingProps['currentContext'],
  userProgress?: DrSageGreetingProps['userProgress']
): string {
  const hour = new Date().getHours();
  let timeGreeting = 'Good morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
  else if (hour >= 17 && hour < 22) timeGreeting = 'Good evening';
  else if (hour >= 22 || hour < 5) timeGreeting = 'Working late? I\'m here to help';

  const parts: string[] = [timeGreeting + '.'];

  if (userProgress?.streak && userProgress.streak >= 3) {
    parts.push(`You're on a ${userProgress.streak}-day streak.`);
  }

  if (userProgress?.modulesCompleted && userProgress.totalModules) {
    const pct = Math.round((userProgress.modulesCompleted / userProgress.totalModules) * 100);
    parts.push(`${pct}% through your learning path.`);
  }

  if (currentContext?.projectName) {
    parts.push(`Working on ${currentContext.projectName}.`);
  } else if (currentContext?.screenName) {
    parts.push(`You're in the ${currentContext.screenName}.`);
  }

  // Add a random fun fact occasionally
  if (Math.random() < 0.3) {
    const fact = DR_SAGE_FUN_FACTS[Math.floor(Math.random() * DR_SAGE_FUN_FACTS.length)];
    parts.push(fact);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// DrSageGreeting
// ---------------------------------------------------------------------------

export function DrSageGreeting({
  userProgress,
  currentContext,
  className,
}: DrSageGreetingProps) {
  const [message] = useState(() => getGreetingMessage(currentContext, userProgress));

  return (
    <p className={cn('text-sm text-zinc-500 leading-relaxed', className)}>
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export function MessageBubble({ text, typing, actions, className }: MessageBubbleProps) {
  const [displayText, setDisplayText] = useState(typing ? '' : text);
  const [typingDone, setTypingDone] = useState(!typing);

  useEffect(() => {
    if (!typing) {
      setDisplayText(text);
      setTypingDone(true);
      return;
    }

    let i = 0;
    setDisplayText('');
    setTypingDone(false);

    const interval = setInterval(() => {
      i++;
      setDisplayText(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setTypingDone(true);
      }
    }, 22);

    return () => clearInterval(interval);
  }, [text, typing]);

  return (
    <div className={cn('border-l-2 border-zinc-200 pl-3', className)}>
      <p className="text-sm text-zinc-600 leading-relaxed">
        {displayText}
        {!typingDone && <span className="text-zinc-300">|</span>}
      </p>
      {typingDone && actions && actions.length > 0 && (
        <div className="flex gap-3 mt-2">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="text-sm text-blue-600 hover:underline"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DrSageStatusIndicator
// ---------------------------------------------------------------------------

const STATUS_TEXT: Record<DrSageStatusIndicatorProps['status'], string> = {
  watching: 'Dr. Sage is watching this workflow',
  'issue-detected': 'Dr. Sage detected potential issues',
  suggestion: 'Dr. Sage has a suggestion',
};

export function DrSageStatusIndicator({ status, message }: DrSageStatusIndicatorProps) {
  return (
    <p className="text-xs text-zinc-400">
      {message || STATUS_TEXT[status]}
    </p>
  );
}

// ---------------------------------------------------------------------------
// ContextualTip
// ---------------------------------------------------------------------------

export function ContextualTip({ tip, onDismiss, onExpand, autoHide = 10000 }: ContextualTipProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoHide);
    return () => clearTimeout(timer);
  }, [onDismiss, autoHide]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className="text-xs text-zinc-400 italic"
    >
      Tip: {tip}{' '}
      <button onClick={onDismiss} className="text-zinc-300 hover:text-zinc-500 ml-1">
        Dismiss
      </button>
      {onExpand && (
        <button onClick={onExpand} className="text-blue-600 hover:underline ml-2">
          Tell me more
        </button>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// QuickAction
// ---------------------------------------------------------------------------

export function QuickAction({ actions, visible }: QuickActionProps) {
  if (!visible || actions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.15 }}
        className="flex flex-col gap-1"
      >
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className="text-sm text-blue-600 hover:underline text-left"
          >
            {action.label}
          </button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Default export (for compatibility)
// ---------------------------------------------------------------------------

export default {
  DrSageGreeting,
  MessageBubble,
  DrSageStatusIndicator,
  ContextualTip,
  QuickAction,
  getGreetingMessage,
  DR_SAGE_TIPS,
  DR_SAGE_FUN_FACTS,
};
