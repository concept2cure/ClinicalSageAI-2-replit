/**
 * useInlineAI — Reusable hook for inline AI actions on structured surfaces
 *
 * Phase 2 primitive. Wraps useAIAction with context-aware defaults
 * for summarize, explain, rewrite, extract, compare, and refine actions.
 *
 * Usage:
 *   const { summarize, explain, rewrite, isLoading, result } = useInlineAI({
 *     projectId: 1,
 *     module: 'cer',
 *     targetType: 'document',
 *   });
 *
 *   await summarize('Selected text content...');
 */

import { useState, useCallback } from 'react';
import {
  useAIAction,
  type AIActionType,
  type AIActionModuleType,
  type AIActionTargetType,
  type AIActionSourceSurface,
  type AIActionResponse,
  type ValidationFinding,
} from './useAIAction';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface UseInlineAIConfig {
  /** Project scope (required). */
  projectId: number;
  /** Module context. */
  module?: AIActionModuleType;
  /** Default target type for actions. */
  targetType?: AIActionTargetType;
  /** Default target ID. */
  targetId?: string | number | null;
  /** Source surface for analytics. */
  sourceSurface?: AIActionSourceSurface;
  /** Document type context. */
  documentType?: string;
  /** Called when an action completes. */
  onComplete?: (response: AIActionResponse) => void;
  /** Called on error. */
  onError?: (error: Error) => void;
}

export interface InlineAIResult {
  content: string;
  rawResponse: AIActionResponse;
}

export interface UseInlineAIReturn {
  /** Summarize selected content. */
  summarize: (content: string) => Promise<InlineAIResult | null>;
  /** Explain selected content. */
  explain: (content: string) => Promise<InlineAIResult | null>;
  /** Rewrite/improve content. */
  rewrite: (content: string) => Promise<InlineAIResult | null>;
  /** Extract structured data from content. */
  extractData: (content: string) => Promise<InlineAIResult | null>;
  /** Compare multiple items. */
  compare: (items: string[]) => Promise<InlineAIResult | null>;
  /** Refine content using validation findings. */
  refineWithFindings: (content: string, findings: ValidationFinding[]) => Promise<InlineAIResult | null>;
  /** Create a follow-up task from context. */
  createTask: (title: string, content: string) => Promise<InlineAIResult | null>;
  /** Generate source attachment metadata. */
  attachAsSource: (content: string) => Promise<InlineAIResult | null>;
  /** Run any arbitrary inline action. */
  runAction: (actionType: AIActionType, payload: Record<string, unknown>) => Promise<InlineAIResult | null>;
  /** Current loading state. */
  isLoading: boolean;
  /** Last error. */
  error: Error | null;
  /** Last result. */
  result: InlineAIResult | null;
  /** Clear state. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useInlineAI(config: UseInlineAIConfig): UseInlineAIReturn {
  const { execute, isLoading, error, reset: resetAction } = useAIAction();
  const [result, setResult] = useState<InlineAIResult | null>(null);

  const runAction = useCallback(
    async (actionType: AIActionType, payload: Record<string, unknown>): Promise<InlineAIResult | null> => {
      try {
        const response = await execute({
          actionType,
          targetType: config.targetType || 'document',
          targetId: config.targetId ?? null,
          projectId: config.projectId,
          module: config.module,
          sourceSurface: config.sourceSurface || 'inline_menu',
          context: config.documentType ? { documentType: config.documentType } : undefined,
          payload,
        });

        const aiResult: InlineAIResult = {
          content: (response.result as any)?.content || '',
          rawResponse: response,
        };

        setResult(aiResult);
        config.onComplete?.(response);
        return aiResult;
      } catch (err) {
        config.onError?.(err instanceof Error ? err : new Error(String(err)));
        return null;
      }
    },
    [execute, config]
  );

  const summarize = useCallback(
    (content: string) => runAction('summarize_selection', { content }),
    [runAction]
  );

  const explain = useCallback(
    (content: string) => runAction('explain_selection', { content }),
    [runAction]
  );

  const rewrite = useCallback(
    (content: string) => runAction('rewrite_selection', { content }),
    [runAction]
  );

  const extractData = useCallback(
    (content: string) => runAction('extract_structured_data', { content }),
    [runAction]
  );

  const compare = useCallback(
    (items: string[]) => runAction('compare_selection', { items }),
    [runAction]
  );

  const refineWithFindings = useCallback(
    (content: string, findings: ValidationFinding[]) =>
      runAction('refine_with_validation_findings', { content, findings }),
    [runAction]
  );

  const createTask = useCallback(
    (title: string, content: string) => runAction('create_followup_task', { title, content }),
    [runAction]
  );

  const attachAsSource = useCallback(
    (content: string) => runAction('attach_selection_as_source', { content }),
    [runAction]
  );

  const reset = useCallback(() => {
    setResult(null);
    resetAction();
  }, [resetAction]);

  return {
    summarize,
    explain,
    rewrite,
    extractData,
    compare,
    refineWithFindings,
    createTask,
    attachAsSource,
    runAction,
    isLoading,
    error,
    result,
    reset,
  };
}
