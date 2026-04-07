/**
 * Claude-style conversation blocks for AnA.
 *
 * Matches Claude.ai's conversation rendering:
 * - ToolExecutionBlock: collapsible step with "Verified X >" expand arrow
 * - ThinkingBlock: collapsible "Show more" for extended thinking
 * - DoneIndicator: checkmark "Done" after completion
 * - StepProgress: step-by-step progress during tool execution
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, Check, Loader2 } from 'lucide-react';

// ─── Tool Execution Block ─────────────────────────────────────────────────────
// Claude shows: "Verified construction and assessed visual presentation output >"
// Clicking expands to show the tool's input/output details.

interface ToolExecutionBlockProps {
  /** Tool display name (e.g., "Searched ClinicalTrials.gov for trial data") */
  label: string;
  /** Tool execution status */
  status: 'running' | 'completed' | 'error';
  /** Tool result content (shown when expanded) */
  result?: string;
  /** Tool input summary (shown when expanded) */
  input?: string;
}

export const ToolExecutionBlock: React.FC<ToolExecutionBlockProps> = ({
  label,
  status,
  result,
  input,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasContent = !!(result || input);

  return (
    <div className="my-2">
      <button
        onClick={() => hasContent && setExpanded(e => !e)}
        disabled={!hasContent}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors w-full text-left',
          status === 'running'
            ? 'text-stone-500'
            : status === 'error'
              ? 'text-red-600 bg-red-50'
              : 'text-stone-600 hover:bg-stone-50',
          hasContent && 'cursor-pointer',
          !hasContent && 'cursor-default'
        )}
        aria-expanded={hasContent ? expanded : undefined}
      >
        {/* Status icon */}
        {status === 'running' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400 flex-shrink-0" />
        ) : status === 'error' ? (
          <span className="w-3.5 h-3.5 flex items-center justify-center text-red-500 flex-shrink-0">!</span>
        ) : (
          <Check className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
        )}

        {/* Label */}
        <span className={cn(
          'flex-1 truncate',
          status === 'completed' && 'text-stone-500'
        )}>
          {label}
        </span>

        {/* Expand arrow */}
        {hasContent && (
          <ChevronRight className={cn(
            'w-3.5 h-3.5 text-stone-300 transition-transform flex-shrink-0',
            expanded && 'rotate-90'
          )} />
        )}
      </button>

      {/* Expanded content */}
      {expanded && hasContent && (
        <div className="ml-8 mt-1 mb-2 px-3 py-2 bg-stone-50 rounded-lg text-xs text-stone-600 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
          {input && (
            <div className="mb-2">
              <span className="text-stone-400 font-sans text-[10px] uppercase tracking-wider">Input</span>
              <div className="mt-0.5">{input}</div>
            </div>
          )}
          {result && (
            <div>
              <span className="text-stone-400 font-sans text-[10px] uppercase tracking-wider">Result</span>
              <div className="mt-0.5">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Thinking Block ───────────────────────────────────────────────────────────
// Claude shows extended thinking as a collapsible "Show more" block at the top
// of the response. User can expand to see the reasoning.

interface ThinkingBlockProps {
  /** The thinking/reasoning content */
  content: string;
  /** Default collapsed state */
  defaultExpanded?: boolean;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!content || content.trim().length === 0) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition-colors"
        aria-expanded={expanded}
      >
        <ChevronRight className={cn(
          'w-3 h-3 transition-transform',
          expanded && 'rotate-90'
        )} />
        {expanded ? 'Hide thinking' : 'Show more'}
      </button>

      {expanded && (
        <div className="mt-2 pl-4 border-l-2 border-stone-200 text-sm text-stone-500 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
};

// ─── Done Indicator ───────────────────────────────────────────────────────────
// Claude shows "⊙ Done" after the response completes.

interface DoneIndicatorProps {
  /** Whether to show the done state */
  visible: boolean;
}

export const DoneIndicator: React.FC<DoneIndicatorProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-1.5 mt-2 mb-1">
      <div className="w-4 h-4 rounded-full border-2 border-stone-300 flex items-center justify-center">
        <Check className="w-2.5 h-2.5 text-stone-400" />
      </div>
      <span className="text-xs text-stone-400 font-medium">Done</span>
    </div>
  );
};

// ─── Step Progress ────────────────────────────────────────────────────────────
// Shows step-by-step progress during tool execution.

interface StepProgressProps {
  steps: Array<{
    label: string;
    status: 'pending' | 'running' | 'completed' | 'error';
  }>;
}

export const StepProgress: React.FC<StepProgressProps> = ({ steps }) => {
  if (steps.length === 0) return null;

  return (
    <div className="space-y-0.5 my-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          {step.status === 'running' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
          ) : step.status === 'completed' ? (
            <Check className="w-3.5 h-3.5 text-stone-400" />
          ) : step.status === 'error' ? (
            <span className="w-3.5 h-3.5 text-red-500 text-center">!</span>
          ) : (
            <div className="w-3.5 h-3.5 rounded-full border border-stone-200" />
          )}
          <span className={cn(
            'text-xs',
            step.status === 'completed' ? 'text-stone-400' : 'text-stone-600'
          )}>
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default {
  ToolExecutionBlock,
  ThinkingBlock,
  DoneIndicator,
  StepProgress,
};
