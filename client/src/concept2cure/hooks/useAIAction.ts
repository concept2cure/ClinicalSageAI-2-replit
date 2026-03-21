/**
 * useAIAction — Client hook for the unified AI action API
 *
 * Provides a single, type-safe interface for invoking any AI action
 * from any surface (AnaPersistentPanel, DrSagePanel, chat, inline, ⌘K).
 *
 * Usage:
 *   const { execute, isLoading, error, lastResponse } = useAIAction();
 *   const result = await execute({
 *     actionType: 'promote_artifact',
 *     targetType: 'artifact',
 *     targetId: 42,
 *     projectId: 1,
 *     sourceSurface: 'global_panel',
 *     payload: {},
 *   });
 *
 * Phase 1: Synchronous request/response.
 * Phase 2: Streaming, optimistic updates, action chaining.
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AIActionType,
  AIActionRequest,
  AIActionResponse,
  AIActionSourceSurface,
  AIActionTargetType,
  AIActionModuleType,
  AIActionContext,
  ValidationFinding,
} from '../../../../shared/types/ai-actions';

// Re-export types for consumer convenience
export type {
  AIActionType,
  AIActionRequest,
  AIActionResponse,
  AIActionSourceSurface,
  AIActionTargetType,
  AIActionModuleType,
  ValidationFinding,
};

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const AI_ACTIONS_ENDPOINT = '/api/ai-actions/execute';
const AI_ACTIONS_TYPES_ENDPOINT = '/api/ai-actions/types';

async function callAIAction(request: Omit<AIActionRequest, 'requestedBy'>): Promise<AIActionResponse> {
  const response = await fetch(AI_ACTIONS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send auth cookies
    body: JSON.stringify(request),
  });

  const data = await response.json();

  // Unwrap if wrapped in a payload envelope (consistent with cortexService pattern)
  if (data?.payload?.data) {
    return data.payload.data as AIActionResponse;
  }

  return data as AIActionResponse;
}

async function fetchActionTypes(): Promise<{ actionType: string; endpoint: string }[]> {
  const response = await fetch(AI_ACTIONS_TYPES_ENDPOINT, {
    credentials: 'include',
  });
  const data = await response.json();
  return data?.actions || [];
}

// ---------------------------------------------------------------------------
// Simplified execute params (caller doesn't need to know full AIActionRequest)
// ---------------------------------------------------------------------------

export interface ExecuteActionParams {
  actionType: AIActionType;
  targetType: AIActionTargetType;
  targetId?: string | number | null;
  projectId: number;
  module?: AIActionModuleType;
  context?: AIActionContext;
  payload?: Record<string, unknown>;
  sourceSurface?: AIActionSourceSurface;
  conversationId?: number | string;
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseAIActionReturn {
  /** Execute an AI action. Returns the response or throws on network error. */
  execute: (params: ExecuteActionParams) => Promise<AIActionResponse>;

  /** Whether an action is currently executing. */
  isLoading: boolean;

  /** Last error (network-level). Action-level errors are in the response. */
  error: Error | null;

  /** Most recent action response. */
  lastResponse: AIActionResponse | null;

  /** Clear the last response and error. */
  reset: () => void;
}

export function useAIAction(): UseAIActionReturn {
  const [lastResponse, setLastResponse] = useState<AIActionResponse | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: ExecuteActionParams) => {
      const request: Omit<AIActionRequest, 'requestedBy'> = {
        actionType: params.actionType,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        projectId: params.projectId,
        module: params.module,
        context: params.context || {},
        payload: params.payload || {},
        sourceSurface: params.sourceSurface || 'api',
        conversationId: params.conversationId,
        threadId: params.threadId,
      };
      return callAIAction(request);
    },
    onSuccess: (data) => {
      setLastResponse(data);

      // Invalidate relevant queries when objects are created/updated
      if (data.createdObjects.length > 0 || data.updatedObjects.length > 0) {
        // Invalidate artifact and document queries
        queryClient.invalidateQueries({ queryKey: ['artifacts'] });
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        queryClient.invalidateQueries({ queryKey: ['project'] });
      }
    },
  });

  const execute = useCallback(
    async (params: ExecuteActionParams): Promise<AIActionResponse> => {
      return mutation.mutateAsync(params);
    },
    [mutation.mutateAsync]
  );

  const reset = useCallback(() => {
    setLastResponse(null);
    mutation.reset();
  }, [mutation]);

  return {
    execute,
    isLoading: mutation.isPending,
    error: mutation.error || null,
    lastResponse,
    reset,
  };
}

// ---------------------------------------------------------------------------
// useAvailableActions — List registered action types
// ---------------------------------------------------------------------------

export function useAvailableActions() {
  return useQuery({
    queryKey: ['ai-action-types'],
    queryFn: fetchActionTypes,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// ---------------------------------------------------------------------------
// Convenience hooks for common action patterns
// ---------------------------------------------------------------------------

/**
 * Shorthand for the promote → validate → refine cycle.
 * Returns helpers for each step of the lifecycle.
 */
export function useArtifactLifecycle(projectId: number) {
  const { execute, isLoading, lastResponse } = useAIAction();

  const promote = useCallback(
    (artifactId: string | number, opts?: { module?: AIActionModuleType; sourceSurface?: AIActionSourceSurface }) =>
      execute({
        actionType: 'promote_artifact',
        targetType: 'artifact',
        targetId: artifactId,
        projectId,
        module: opts?.module,
        sourceSurface: opts?.sourceSurface || 'global_panel',
      }),
    [execute, projectId]
  );

  const validate = useCallback(
    (targetId: string | number, targetType: AIActionTargetType, opts?: { documentType?: string }) =>
      execute({
        actionType: 'run_validation',
        targetType,
        targetId,
        projectId,
        sourceSurface: 'global_panel',
        payload: { documentType: opts?.documentType },
      }),
    [execute, projectId]
  );

  const refine = useCallback(
    (targetId: string | number, targetType: AIActionTargetType, findings: ValidationFinding[]) =>
      execute({
        actionType: 'refine_with_validation',
        targetType,
        targetId,
        projectId,
        sourceSurface: 'global_panel',
        payload: { findings },
      }),
    [execute, projectId]
  );

  return { promote, validate, refine, isLoading, lastResponse };
}
