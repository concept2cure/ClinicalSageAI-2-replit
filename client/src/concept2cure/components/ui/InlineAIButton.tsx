/**
 * InlineAIButton — Single AI action button for rows, cards, and inline use
 *
 * Phase 2 primitive. Simpler than InlineAIMenu — executes one specific
 * action directly when clicked. Good for row-level actions in tables.
 *
 * Usage:
 *   <InlineAIButton
 *     actionType="summarize_selection"
 *     content={row.content}
 *     projectId={1}
 *     onResult={(r) => setResult(r)}
 *     label="Summarize"
 *   />
 */

import React, { useCallback, useState } from 'react';
import { useInlineAI, type UseInlineAIConfig, type InlineAIResult } from '../../hooks/useInlineAI';
import type { AIActionType, ValidationFinding } from '../../hooks/useAIAction';

export interface InlineAIButtonProps extends Omit<UseInlineAIConfig, 'onComplete'> {
  /** Which action to execute. */
  actionType: AIActionType;
  /** Content for the action. */
  content: string;
  /** Title for context. */
  title?: string;
  /** Items for compare actions. */
  items?: string[];
  /** Findings for refinement. */
  findings?: ValidationFinding[];
  /** Called with result. */
  onResult?: (result: InlineAIResult) => void;
  /** Button label. */
  label?: string;
  /** Button icon. */
  icon?: string;
  /** Visual size. */
  size?: 'sm' | 'md';
  /** Disabled state. */
  disabled?: boolean;
  /** Additional class. */
  className?: string;
}

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  summarize_selection: { label: 'Summarize', icon: '📋' },
  explain_selection: { label: 'Explain', icon: '💡' },
  rewrite_selection: { label: 'Rewrite', icon: '✏️' },
  extract_structured_data: { label: 'Extract', icon: '📊' },
  compare_selection: { label: 'Compare', icon: '⚖️' },
  refine_with_validation_findings: { label: 'Refine', icon: '🔧' },
  create_followup_task: { label: 'Create Task', icon: '📌' },
  attach_selection_as_source: { label: 'Attach', icon: '📎' },
  run_validation: { label: 'Validate', icon: '✓' },
};

export function InlineAIButton({
  actionType,
  content,
  title,
  items,
  findings,
  onResult,
  label,
  icon,
  size = 'sm',
  disabled = false,
  className = '',
  ...config
}: InlineAIButtonProps) {
  const inlineAI = useInlineAI(config);
  const [tooltipResult, setTooltipResult] = useState<string | null>(null);

  const defaults = ACTION_LABELS[actionType] || { label: 'AI', icon: '✨' };
  const displayLabel = label || defaults.label;
  const displayIcon = icon || defaults.icon;

  const handleClick = useCallback(async () => {
    const payload: Record<string, unknown> = { content };
    if (title) payload.title = title;
    if (items) payload.items = items;
    if (findings) payload.findings = findings;

    const result = await inlineAI.runAction(actionType, payload);
    if (result) {
      setTooltipResult(result.content.slice(0, 200));
      onResult?.(result);
      // Auto-hide after 5s
      setTimeout(() => setTooltipResult(null), 5000);
    }
  }, [actionType, content, title, items, findings, inlineAI, onResult]);

  return (
    <span className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || inlineAI.isLoading}
        title={`${displayLabel}: ${defaults.label}`}
        className={`inline-flex items-center gap-0.5 border border-stone-200 rounded
          ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-[13px]'}
          ${inlineAI.isLoading ? 'bg-stone-100' : 'bg-white'}
          text-stone-600 whitespace-nowrap transition-colors duration-150
          hover:border-stone-300 hover:bg-stone-50
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className={size === 'sm' ? 'text-[11px]' : 'text-[13px]'}>
          {inlineAI.isLoading ? '⏳' : displayIcon}
        </span>
        <span>{displayLabel}</span>
      </button>

      {/* Tooltip result */}
      {tooltipResult && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-[280px] px-2.5 py-2 bg-stone-900 text-stone-100 text-xs leading-relaxed rounded-md shadow-lg whitespace-pre-wrap">
          {tooltipResult}
          {tooltipResult.length >= 200 && '...'}
        </div>
      )}
    </span>
  );
}

export default InlineAIButton;
