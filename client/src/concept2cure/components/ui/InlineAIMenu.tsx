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
        className={buttonClass}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || inlineAI.isLoading}
        title="AI Actions"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: variant === 'icon' ? '4px 6px' : '6px 12px',
          fontSize: variant === 'compact' ? '12px' : '13px',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          background: inlineAI.isLoading ? '#f1f5f9' : '#ffffff',
          color: '#334155',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.15s',
        }}
      >
        {inlineAI.isLoading ? (
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
        ) : (
          <span>✨</span>
        )}
        {variant !== 'icon' && <span>{inlineAI.isLoading ? 'Processing...' : label}</span>}
      </button>

      {/* Dropdown menu */}
      {isOpen && !inlineAI.isLoading && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 50,
            marginTop: '4px',
            minWidth: '220px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '4px' }}>
            {visibleActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleAction(action.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '13px',
                  color: '#334155',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{action.icon}</span>
                <div>
                  <div style={{ fontWeight: 500 }}>{action.label}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{action.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result panel */}
      {resultContent && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 50,
            marginTop: '4px',
            width: '360px',
            maxHeight: '300px',
            overflow: 'auto',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            padding: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>AI Result</span>
            <button
              type="button"
              onClick={() => setResultContent(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '13px', lineHeight: '1.5', color: '#334155', whiteSpace: 'pre-wrap' }}>
            {resultContent}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(resultContent)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                background: '#f8fafc',
                cursor: 'pointer',
              }}
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
