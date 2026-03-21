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

  const padding = size === 'sm' ? '3px 8px' : '5px 12px';
  const fontSize = size === 'sm' ? '11px' : '13px';

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || inlineAI.isLoading}
        title={`${displayLabel}: ${defaults.label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding,
          fontSize,
          border: '1px solid #e2e8f0',
          borderRadius: '4px',
          background: inlineAI.isLoading ? '#f1f5f9' : '#ffffff',
          color: '#475569',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: size === 'sm' ? '11px' : '13px' }}>
          {inlineAI.isLoading ? '⏳' : displayIcon}
        </span>
        <span>{displayLabel}</span>
      </button>

      {/* Tooltip result */}
      {tooltipResult && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            zIndex: 50,
            marginBottom: '4px',
            width: '280px',
            padding: '8px 10px',
            background: '#1e293b',
            color: '#f1f5f9',
            fontSize: '12px',
            lineHeight: '1.4',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {tooltipResult}
          {tooltipResult.length >= 200 && '...'}
        </div>
      )}
    </span>
  );
}

export default InlineAIButton;
