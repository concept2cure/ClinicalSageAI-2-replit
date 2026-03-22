/**
 * Concept2Cure Cortex Hooks
 *
 * React Query hooks for AnA 1.0 RI and Project Cortex integration.
 * Provides reactive data fetching, caching, and state management.
 *
 * @module concept2cure/hooks/useCortex
 * @version 3.0.0
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useVisibleInterval } from './useVisibleInterval';
import {
  cortexService,
  cortexQueryKeys,
  type CortexMessage,
  type CortexThread,
  type CortexSearchResult,
  type CortexHealth,
  type CortexStats,
  type RegulatorySignal,
  type SubmissionPrediction,
  type CortexArtifact,
} from '../services/cortexService';

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH & STATUS HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for Cortex health status
 */
export function useCortexHealth(options?: { refetchInterval?: number }) {
  const interval = useVisibleInterval(options?.refetchInterval ?? 30000);
  return useQuery({
    queryKey: cortexQueryKeys.health(),
    queryFn: () => cortexService.getHealth(),
    refetchInterval: interval,
    staleTime: 10000,
  });
}

/**
 * Hook for Cortex statistics
 */
export function useCortexStats() {
  return useQuery({
    queryKey: cortexQueryKeys.stats(),
    queryFn: () => cortexService.getStats(),
    staleTime: 60000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

interface UseCortexChatOptions {
  projectId?: string;
  submissionType?: string;
  threadId?: string;
  systemPrompt?: string;
  sectionCode?: string;
  onArtifact?: (artifact: CortexArtifact) => void;
}

interface UseCortexChatReturn {
  messages: CortexMessage[];
  threadId: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  error: Error | null;
  sendMessage: (content: string) => Promise<void>;
  streamMessage: (content: string) => void;
  cancelStream: () => void;
  clearMessages: () => void;
  setMessages: (messages: CortexMessage[]) => void;
}

/**
 * Fetch project context for AI enrichment
 */
function useProjectContext(projectId?: string) {
  const [context, setContext] = useState<{
    name?: string;
    description?: string;
    status?: string;
    taskSummary?: { total: number; completed: number; overdue: number; blocked: number };
    cmcDrugSubstance?: Record<string, string>;
    cmcDrugProduct?: Record<string, string>;
    customInstructions?: string;
  } | null>(null);

  useEffect(() => {
    if (!projectId) { setContext(null); return; }
    const token = sessionStorage.getItem('concept2cure_token') || localStorage.getItem('concept2cure_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`/api/concept2cure/projects/${projectId}/context`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setContext(data); })
      .catch(() => {});
  }, [projectId]);

  return context;
}

/**
 * Hook for AI chat with AnA Cortex
 */
export function useCortexChat(options: UseCortexChatOptions = {}): UseCortexChatReturn {
  const [messages, setMessages] = useState<CortexMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(options.threadId ?? null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const streamingMessageRef = useRef<string>('');
  const queryClient = useQueryClient();
  const projectContext = useProjectContext(options.projectId);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      return cortexService.sendMessage({
        message: content,
        threadId: threadId ?? undefined,
        projectId: options.projectId,
        submissionType: options.submissionType,
        systemPrompt: options.systemPrompt,
        sectionCode: options.sectionCode,
        projectContext: projectContext || undefined,
      });
    },
    onMutate: async content => {
      // Optimistically add user message
      const userMessage: CortexMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setError(null);
    },
    onSuccess: data => {
      const assistantMessage: CortexMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        metadata: {
          artifacts: data.artifacts,
          citations: data.citations,
          tokenUsage: data.tokenUsage,
        },
      };
      setMessages(prev => [...prev, assistantMessage]);
      setThreadId(data.threadId);

      // Notify about artifacts
      if (data.artifacts && options.onArtifact) {
        data.artifacts.forEach(options.onArtifact);
      }

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: cortexQueryKeys.threads() });
    },
    onError: err => {
      setError(err instanceof Error ? err : new Error('Failed to send message'));
      // Remove optimistic user message on error
      setMessages(prev => prev.slice(0, -1));
    },
  });

  const sendMessage = useCallback(
    async (content: string) => {
      await sendMutation.mutateAsync(content);
    },
    [sendMutation]
  );

  const streamMessage = useCallback(
    (content: string) => {
      // Prevent concurrent streaming — ignore if already streaming
      if (isStreaming) return;

      setIsStreaming(true);
      setError(null);
      streamingMessageRef.current = '';

      // Track if this is the first message (for auto-title)
      const isFirstMessage = messages.length === 0;

      // Add user message
      const userMessage: CortexMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);

      // Add placeholder for assistant response
      const assistantId = crypto.randomUUID();
      setMessages(prev => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        },
      ]);

      cortexService.streamMessage({
        message: content,
        threadId: threadId ?? undefined,
        projectId: options.projectId,
        submissionType: options.submissionType,
        systemPrompt: options.systemPrompt,
        sectionCode: options.sectionCode,
        projectContext: projectContext || undefined,
        onChunk: chunk => {
          streamingMessageRef.current += chunk;
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId ? { ...m, content: streamingMessageRef.current } : m
            )
          );
        },
        onComplete: result => {
          setIsStreaming(false);
          setThreadId(result.threadId);
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId ? { ...m, metadata: { artifacts: result.artifacts } } : m
            )
          );

          if (result.artifacts && options.onArtifact) {
            result.artifacts.forEach(options.onArtifact);
          }

          // Auto-title: set thread title from first user message
          if (isFirstMessage && result.threadId) {
            const derived = content.trim().slice(0, 60) + (content.length > 60 ? '...' : '');
            cortexService.updateThreadTitle(result.threadId, derived).then(() => {
              queryClient.invalidateQueries({ queryKey: cortexQueryKeys.threads() });
            });
          } else {
            queryClient.invalidateQueries({ queryKey: cortexQueryKeys.threads() });
          }
        },
        onError: err => {
          setIsStreaming(false);
          setError({ ...err, failedMessage: content });
          // Remove the empty assistant placeholder but keep the user message
          setMessages(prev => prev.slice(0, -1));
        },
      });
    },
    [threadId, options, queryClient, messages.length]
  );

  const cancelStream = useCallback(() => {
    cortexService.cancelRequest();
    setIsStreaming(false);
    // Remove empty/partial assistant placeholder if no content was streamed
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && !last.content) {
        return prev.slice(0, -1);
      }
      // Mark partial responses as cancelled
      if (last?.role === 'assistant') {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: m.content + '\n\n_(Response cancelled)_' } : m
        );
      }
      return prev;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setThreadId(null);
    setError(null);
  }, []);

  return {
    messages,
    threadId,
    isLoading: sendMutation.isPending,
    isStreaming,
    error,
    sendMessage,
    streamMessage,
    cancelStream,
    clearMessages,
    setMessages,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

interface UseCortexSearchOptions {
  types?: string[];
  limit?: number;
  minScore?: number;
  enabled?: boolean;
}

/**
 * Hook for semantic search
 */
export function useCortexSearch(query: string, options: UseCortexSearchOptions = {}) {
  return useQuery({
    queryKey: cortexQueryKeys.search(query),
    queryFn: () =>
      cortexService.search({
        query,
        types: options.types,
        limit: options.limit,
        minScore: options.minScore,
      }),
    enabled: (options.enabled ?? true) && query.length >= 2,
    staleTime: 30000,
  });
}

/**
 * Hook for lazy search (manual trigger)
 */
export function useCortexSearchMutation() {
  return useMutation({
    mutationFn: (params: { query: string; types?: string[]; limit?: number; minScore?: number }) =>
      cortexService.search(params),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREAD HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for listing threads
 */
export function useCortexThreads(projectId?: string) {
  return useQuery({
    queryKey: cortexQueryKeys.threads(projectId),
    queryFn: () => cortexService.getThreads({ projectId }),
    staleTime: 30000,
  });
}

/**
 * Hook for single thread with messages
 */
export function useCortexThread(threadId: string | null) {
  return useQuery({
    queryKey: cortexQueryKeys.thread(threadId ?? ''),
    queryFn: () => (threadId ? cortexService.getThread(threadId) : null),
    enabled: !!threadId,
  });
}

/**
 * Hook for deleting threads
 */
export function useDeleteCortexThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threadId: string) => cortexService.deleteThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cortexQueryKeys.threads() });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATORY INTELLIGENCE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

interface UseSignalsOptions {
  agency?: string;
  type?: string;
  submissionType?: string;
  limit?: number;
  since?: Date;
  enabled?: boolean;
}

/**
 * Hook for regulatory signals
 */
export function useCortexSignals(options: UseSignalsOptions = {}) {
  return useQuery({
    queryKey: cortexQueryKeys.signals(options),
    queryFn: () => cortexService.getSignals(options),
    enabled: options.enabled ?? true,
    staleTime: 60000,
  });
}

/**
 * Hook for submission predictions
 */
export function useCortexPredictions(submissionId: string | null) {
  return useQuery({
    queryKey: cortexQueryKeys.predictions(submissionId ?? ''),
    queryFn: () => (submissionId ? cortexService.getPredictions(submissionId) : []),
    enabled: !!submissionId,
    staleTime: 60000,
  });
}

/**
 * Hook for full advisory analysis
 */
export function useCortexAdvisory(projectId: string | null) {
  return useQuery({
    queryKey: cortexQueryKeys.advisory(projectId ?? ''),
    queryFn: () => (projectId ? cortexService.getAdvisory(projectId) : null),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All-in-one Cortex hook for Zen App
 */
export function useCortex(
  options: {
    projectId?: string;
    submissionType?: string;
  } = {}
) {
  const health = useCortexHealth();
  const stats = useCortexStats();
  const threads = useCortexThreads(options.projectId);
  const signals = useCortexSignals({ submissionType: options.submissionType, limit: 5 });
  const chat = useCortexChat(options);

  return {
    // Status
    isHealthy: health.data?.status === 'healthy',
    health: health.data,
    stats: stats.data,

    // Chat
    ...chat,

    // Data
    threads: threads.data ?? [],
    signals: signals.data ?? [],

    // Loading states
    isInitializing: health.isLoading || stats.isLoading,
    isLoadingThreads: threads.isLoading,
    isLoadingSignals: signals.isLoading,
  };
}
