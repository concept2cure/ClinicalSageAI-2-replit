/**
 * AIContextualActionGroup — Bulk/selection action bar for tables
 *
 * Phase 2 primitive. Renders a floating action bar when items are selected
 * in a table or list, offering AI actions on the selection.
 *
 * Usage:
 *   <AIContextualActionGroup
 *     selectedItems={selectedRows.map(r => r.content)}
 *     selectedCount={selectedRows.length}
 *     projectId={1}
 *     onResult={(result) => handleBulkResult(result)}
 *     onClearSelection={() => setSelected([])}
 *   />
 */

import React from 'react';
import InlineAIMenu from './InlineAIMenu';
import type { AIActionType } from '../../hooks/useAIAction';
import type { InlineAIResult, UseInlineAIConfig } from '../../hooks/useInlineAI';

export interface AIContextualActionGroupProps extends Omit<UseInlineAIConfig, 'onComplete'> {
  /** Content of selected items (joined for single actions, kept separate for compare). */
  selectedItems: string[];
  /** Number of selected items. */
  selectedCount: number;
  /** Called with AI result. */
  onResult?: (result: InlineAIResult) => void;
  /** Clear the selection. */
  onClearSelection?: () => void;
  /** Which actions to show. */
  actions?: AIActionType[];
  /** Label prefix. */
  label?: string;
  /** Additional class. */
  className?: string;
}

export function AIContextualActionGroup({
  selectedItems,
  selectedCount,
  onResult,
  onClearSelection,
  actions,
  label,
  className = '',
  ...config
}: AIContextualActionGroupProps) {
  if (selectedCount === 0) return null;

  const joinedContent = selectedItems.join('\n\n---\n\n');

  // Auto-include compare when multiple items selected
  const effectiveActions = actions || [
    'summarize_selection',
    'explain_selection',
    'rewrite_selection',
    'extract_structured_data',
    ...(selectedCount >= 2 ? ['compare_selection' as AIActionType] : []),
    'create_followup_task',
  ];

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        fontSize: '13px',
      }}
    >
      <span style={{ fontWeight: 500, color: '#1e40af' }}>
        {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
      </span>

      <InlineAIMenu
        content={joinedContent}
        items={selectedCount >= 2 ? selectedItems : undefined}
        actions={effectiveActions}
        variant="button"
        label={label || 'AI Actions'}
        onResult={onResult}
        {...config}
      />

      {onClearSelection && (
        <button
          type="button"
          onClick={onClearSelection}
          style={{
            padding: '4px 10px',
            fontSize: '12px',
            border: '1px solid #bfdbfe',
            borderRadius: '4px',
            background: '#fff',
            color: '#3b82f6',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default AIContextualActionGroup;
