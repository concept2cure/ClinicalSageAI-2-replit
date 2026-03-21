/**
 * useAIAction — Client hook for the unified AI action API
 *
 * Provides type-safe interfaces for invoking AI actions from any surface.
 * Supports both synchronous and async (queued) actions with optional
 * SSE streaming for real-time progress updates.
 *
 * Usage:
 *   const { execute, isLoading, error, lastResponse } = useAIAction();
 *   const result = await execute({
 *     actionType: 'promote_artifact',
 *     targetType: 'artifact',
 *     targetId: 42,
 *     projectId: 1,
 *     sourceSurface: 'global_panel',
 *   });
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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

const BASE = '/api/ai-actions';

interface AsyncActionResponse {
  success: true;
  queued: true;
  jobId: string;
  statusUrl: string;
  streamUrl: string;
  message: string;
}

async function callAIAction(
  request: Omit<AIActionRequest, 'requestedBy'>
): Promise<AIActionResponse | AsyncActionResponse> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });
  } catch (err) {
    throw new Error(`Network error calling AI action: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`AI action returned non-JSON response (HTTP ${response.status})`);
  }

  const data = await response.json();

  // Handle payload envelope (consistent with cortexService pattern)
  if (data?.payload?.data) return data.payload.data;

  return data;
}

async function fetchActionTypes(): Promise<{ actionType: string; endpoint: string }[]> {
  const response = await fetch(`${BASE}/types`, { credentials: 'include' });
  const data = await response.json();
  return data?.actions || [];
}

async function pollJobStatus(jobId: string): Promise<{
  status: 'queued' | 'active' | 'completed' | 'failed';
  response?: AIActionResponse;
  error?: string;
  progress?: number;
}> {
  const response = await fetch(`${BASE}/jobs/${jobId}`, { credentials: 'include' });
  return response.json();
}

async function cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${BASE}/jobs/${jobId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return response.json();
}

// ---------------------------------------------------------------------------
// Simplified execute params
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
  /** Force synchronous execution even for normally-queued actions. */
  async?: boolean;
}

// ---------------------------------------------------------------------------
// useAIAction — Primary hook
// ---------------------------------------------------------------------------

export interface UseAIActionReturn {
  execute: (params: ExecuteActionParams) => Promise<AIActionResponse>;
  isLoading: boolean;
  error: Error | null;
  lastResponse: AIActionResponse | null;
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

      const result = await callAIAction(request);

      // If the action was queued (202), poll until completion
      if ('queued' in result && result.queued) {
        return pollUntilComplete(result.jobId);
      }

      return result as AIActionResponse;
    },
    onSuccess: (data) => {
      setLastResponse(data);
      if (data.createdObjects.length > 0 || data.updatedObjects.length > 0) {
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
// useAsyncAction — For long-running actions with progress tracking
// ---------------------------------------------------------------------------

export interface AsyncActionState {
  jobId: string | null;
  status: 'idle' | 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  response: AIActionResponse | null;
  error: string | null;
}

export interface UseAsyncActionReturn {
  execute: (params: ExecuteActionParams) => Promise<void>;
  cancel: () => Promise<void>;
  state: AsyncActionState;
  reset: () => void;
}

export function useAsyncAction(): UseAsyncActionReturn {
  const [state, setState] = useState<AsyncActionState>({
    jobId: null,
    status: 'idle',
    progress: 0,
    response: null,
    error: null,
  });
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  // Clean up SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const execute = useCallback(async (params: ExecuteActionParams) => {
    // Close any existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setState({ jobId: null, status: 'queued', progress: 0, response: null, error: null });

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

    const result = await callAIAction(request);

    // Synchronous completion
    if (!('queued' in result) || !result.queued) {
      const response = result as AIActionResponse;
      setState({
        jobId: null,
        status: response.success ? 'completed' : 'failed',
        progress: 100,
        response,
        error: response.errors?.[0]?.message || null,
      });
      if (response.createdObjects?.length > 0 || response.updatedObjects?.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['artifacts'] });
        queryClient.invalidateQueries({ queryKey: ['documents'] });
      }
      return;
    }

    // Async — connect SSE stream for real-time updates
    const asyncResult = result as AsyncActionResponse;
    setState(prev => ({ ...prev, jobId: asyncResult.jobId, status: 'queued' }));

    try {
      const es = new EventSource(`${BASE}/stream?jobId=${asyncResult.jobId}`);
      eventSourceRef.current = es;

      es.addEventListener('job-update', (event) => {
        const data = JSON.parse(event.data);
        setState(prev => ({
          ...prev,
          status: data.status,
          response: data.result || prev.response,
          error: data.error || prev.error,
        }));
      });

      es.addEventListener('done', (event) => {
        const data = JSON.parse(event.data);
        es.close();
        eventSourceRef.current = null;
        setState(prev => ({
          ...prev,
          status: data.status,
          progress: 100,
        }));
        queryClient.invalidateQueries({ queryKey: ['artifacts'] });
        queryClient.invalidateQueries({ queryKey: ['documents'] });
      });

      es.addEventListener('error', () => {
        // SSE connection error — fall back to polling
        es.close();
        eventSourceRef.current = null;
        pollUntilComplete(asyncResult.jobId).then(response => {
          setState({
            jobId: asyncResult.jobId,
            status: response.success ? 'completed' : 'failed',
            progress: 100,
            response,
            error: response.errors?.[0]?.message || null,
          });
        });
      });
    } catch {
      // SSE not supported — poll
      const response = await pollUntilComplete(asyncResult.jobId);
      setState({
        jobId: asyncResult.jobId,
        status: response.success ? 'completed' : 'failed',
        progress: 100,
        response,
        error: response.errors?.[0]?.message || null,
      });
    }
  }, [queryClient]);

  const cancel = useCallback(async () => {
    if (!state.jobId) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    await cancelJob(state.jobId);
    setState(prev => ({ ...prev, status: 'cancelled' }));
  }, [state.jobId]);

  const reset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState({ jobId: null, status: 'idle', progress: 0, response: null, error: null });
  }, []);

  return { execute, cancel, state, reset };
}

// ---------------------------------------------------------------------------
// Polling fallback (when SSE unavailable)
// ---------------------------------------------------------------------------

async function pollUntilComplete(
  jobId: string,
  maxPolls = 60,
  intervalMs = 2000
): Promise<AIActionResponse> {
  for (let i = 0; i < maxPolls; i++) {
    const result = await pollJobStatus(jobId);

    if (result.status === 'completed' && result.response) {
      return result.response;
    }

    if (result.status === 'failed') {
      return {
        success: false,
        actionType: 'run_validation' as any,
        status: 'failed',
        result: null,
        createdObjects: [],
        updatedObjects: [],
        warnings: [],
        errors: [{ code: 'JOB_FAILED', message: result.error || 'Async job failed' }],
        provenance: {
          actionId: jobId,
          timestamp: new Date().toISOString(),
          userId: 0,
          organizationId: 0,
          projectId: 0,
          sourceSurface: 'api',
        },
        nextSuggestedActions: [],
      };
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error(`Job ${jobId} did not complete within ${maxPolls * intervalMs / 1000}s`);
}

// ---------------------------------------------------------------------------
// useAvailableActions — List registered action types
// ---------------------------------------------------------------------------

export function useAvailableActions() {
  return useQuery({
    queryKey: ['ai-action-types'],
    queryFn: fetchActionTypes,
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// useArtifactLifecycle — Convenience hook for promote/validate/refine cycle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// useActionHistory — Query action history
// ---------------------------------------------------------------------------

export function useActionHistory(projectId?: number, options?: { limit?: number; actionType?: string }) {
  return useQuery({
    queryKey: ['ai-action-history', projectId, options?.actionType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', String(projectId));
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.actionType) params.set('actionType', options.actionType);

      const response = await fetch(`${BASE}/history?${params}`, { credentials: 'include' });
      return response.json();
    },
    staleTime: 30_000,
  });
}
