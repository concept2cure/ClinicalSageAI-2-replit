/**
 * InlineAIMenu — Contextual AI action menu for structured surfaces
 *
 * Phase 2 primitive. Renders a dropdown/popover menu of AI actions
 * relevant to the current selection or context. Used on:
 * - table row actions
 * - bulk selection bars
 * - form section headers
 * - file viewer toolbars
 *
 * Usage:
 *   <InlineAIMenu
 *     content={selectedText}
 *     projectId={1}
 *     module="cer"
 *     onResult={(result) => handleAIResult(result)}
 *   />
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useInlineAI, type UseInlineAIConfig, type InlineAIResult } from '../../hooks/useInlineAI';
import type { AIActionType, ValidationFinding } from '../../hooks/useAIAction';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InlineAIMenuAction {
  id: AIActionType;
  label: string;
  icon: string;
  description: string;
  /** Only show when multiple items are selected. */
  requiresMultiple?: boolean;
  /** Only show when validation findings are available. */
  requiresFindings?: boolean;
}

export interface InlineAIMenuProps extends Omit<UseInlineAIConfig, 'onComplete'> {
  /** Text content or row data for the action. */
  content: string;
  /** Title/label for context. */
  title?: string;
  /** Multiple items for compare actions. */
  items?: string[];
  /** Validation findings if available. */
  findings?: ValidationFinding[];
  /** Called with AI result. */
  onResult?: (result: InlineAIResult) => void;
  /** Called when action starts. */
  onActionStart?: (actionType: AIActionType) => void;
  /** Which actions to show (defaults to all applicable). */
  actions?: AIActionType[];
  /** Visual variant. */
  variant?: 'icon' | 'button' | 'compact';
  /** Button label override. */
  label?: string;
  /** Disabled state. */
  disabled?: boolean;
  /** Additional CSS class. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Default action definitions
// ---------------------------------------------------------------------------

const ALL_ACTIONS: InlineAIMenuAction[] = [
  { id: 'summarize_selection', label: 'Summarize', icon: '📋', description: 'Generate a concise summary' },
  { id: 'explain_selection', label: 'Explain', icon: '💡', description: 'Explain in regulatory context' },
  { id: 'rewrite_selection', label: 'Rewrite', icon: '✏️', description: 'Improve clarity and compliance' },
  { id: 'extract_structured_data', label: 'Extract Data', icon: '📊', description: 'Extract structured fields' },
  { id: 'compare_selection', label: 'Compare', icon: '⚖️', description: 'Compare selected items', requiresMultiple: true },
  { id: 'refine_with_validation_findings', label: 'Refine', icon: '🔧', description: 'Fix validation issues', requiresFindings: true },
  { id: 'create_followup_task', label: 'Create Task', icon: '📌', description: 'Create follow-up task' },
  { id: 'attach_selection_as_source', label: 'Attach as Source', icon: '📎', description: 'Attach as evidence source' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineAIMenu({
  content,
  title,
  items,
  findings,
  onResult,
  onActionStart,
  actions: allowedActions,
  variant = 'button',
  label = 'AI Actions',
  disabled = false,
  className = '',
  ...config
}: InlineAIMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<AIActionType | null>(null);
  const [resultContent, setResultContent] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const inlineAI = useInlineAI({
    ...config,
    onComplete: (response) => {
      const resultText = (response.result as any)?.content || '';
      setResultContent(resultText);
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Filter actions based on context
  const visibleActions = ALL_ACTIONS.filter((action) => {
    if (allowedActions && !allowedActions.includes(action.id)) return false;
    if (action.requiresMultiple && (!items || items.length < 2)) return false;
    if (action.requiresFindings && (!findings || findings.length === 0)) return false;
    return true;
  });

  const handleAction = useCallback(
    async (actionType: AIActionType) => {
      setActiveAction(actionType);
      setIsOpen(false);
      setResultContent(null);
      onActionStart?.(actionType);

      let result: InlineAIResult | null = null;

      switch (actionType) {
        case 'summarize_selection':
          result = await inlineAI.summarize(content);
          break;
        case 'explain_selection':
          result = await inlineAI.explain(content);
          break;
        case 'rewrite_selection':
          result = await inlineAI.rewrite(content);
          break;
        case 'extract_structured_data':
          result = await inlineAI.extractData(content);
          break;
        case 'compare_selection':
          result = await inlineAI.compare(items || []);
          break;
        case 'refine_with_validation_findings':
          result = await inlineAI.refineWithFindings(content, findings || []);
          break;
        case 'create_followup_task':
          result = await inlineAI.createTask(title || '', content);
          break;
        case 'attach_selection_as_source':
          result = await inlineAI.attachAsSource(content);
          break;
        default:
          result = await inlineAI.runAction(actionType, { content });
      }

      if (result) {
        onResult?.(result);
      }
      setActiveAction(null);
    },
    [content, items, findings, title, inlineAI, onResult, onActionStart]
  );

  const buttonClass = variant === 'compact'
    ? 'inline-ai-trigger-compact'
    : variant === 'icon'
      ? 'inline-ai-trigger-icon'
      : 'inline-ai-trigger';

  return (
    <div ref={menuRef} className={`inline-ai-menu-container ${className}`} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button */}
      <button
        type="button"
        className={`${buttonClass} inline-flex items-center gap-1 border border-stone-200 rounded-md
          ${variant === 'icon' ? 'px-1.5 py-1' : 'px-3 py-1.5'}
          ${variant === 'compact' ? 'text-xs' : 'text-[13px]'}
          ${inlineAI.isLoading ? 'bg-stone-100' : 'bg-white'}
          text-stone-700 hover:border-stone-300 hover:bg-stone-50
          disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || inlineAI.isLoading}
        title="AI Actions"
      >
        {inlineAI.isLoading ? (
          <span className="inline-block animate-spin">⚙️</span>
        ) : (
          <span>✨</span>
        )}
        {variant !== 'icon' && <span>{inlineAI.isLoading ? 'Processing...' : label}</span>}
      </button>

      {/* Dropdown menu */}
      {isOpen && !inlineAI.isLoading && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[220px] bg-white border border-stone-200 rounded-lg shadow-md overflow-hidden">
          <div className="p-1">
            {visibleActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleAction(action.id)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[13px] text-stone-700 rounded hover:bg-stone-100 transition-colors"
              >
                <span>{action.icon}</span>
                <div>
                  <div className="font-medium">{action.label}</div>
                  <div className="text-[11px] text-stone-400">{action.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result panel */}
      {resultContent && (
        <div className="absolute top-full right-0 z-50 mt-1 w-[360px] max-h-[300px] overflow-auto bg-white border border-stone-200 rounded-lg shadow-md p-3">
          <div className="flex justify-between mb-2">
            <span className="text-xs font-semibold text-stone-500">AI Result</span>
            <button
              type="button"
              onClick={() => setResultContent(null)}
              className="text-stone-400 hover:text-stone-600 text-sm bg-transparent border-none cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="text-[13px] leading-relaxed text-stone-700 whitespace-pre-wrap">
            {resultContent}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(resultContent)}
              className="px-2.5 py-1 text-[11px] border border-stone-200 rounded bg-stone-50 hover:bg-stone-100 cursor-pointer transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default InlineAIMenu;
