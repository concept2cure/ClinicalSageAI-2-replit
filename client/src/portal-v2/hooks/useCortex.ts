/**
 * Cortex Prime React Hooks
 *
 * Production-grade React Query hooks for the Cortex Prime AI backend.
 * Provides caching, optimistic updates, error boundaries, and loading states.
 *
 * Features:
 * - Type-safe hooks with full IntelliSense support
 * - Optimistic updates for mutations
 * - Automatic cache invalidation
 * - Configurable stale times and retry logic
 * - Debounced search for performance
 * - Error boundary integration
 *
 * @version 2.1.0
 * @module portal-v2/hooks/useCortex
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  QueryKey,
} from '@tanstack/react-query';
import {
  cortexClient,
  CortexError,
  CORTEX_ERROR_CODES,
  type CortexAtom,
  type CortexEdge,
  type CortexThread,
  type CortexTrace,
  type CortexSearchResult,
  type CortexHealth,
  type CortexStats,
  type GraphStats,
  type AdvisoryResult,
  type IntuitionPrediction,
  type RegulatorySignal,
  type UncertaintyEstimate,
  type TraversalResult,
  type SearchOptions,
  type CreateThreadOptions,
  type CreateAtomOptions,
  type TraversalOptions,
  type PredictionOptions,
} from '../services/cortexClient';

// Re-export types for convenience
export type {
  CortexAtom,
  CortexEdge,
  CortexThread,
  CortexTrace,
  CortexSearchResult,
  CortexHealth,
  CortexStats,
  GraphStats,
  AdvisoryResult,
  IntuitionPrediction,
  RegulatorySignal,
  UncertaintyEstimate,
  TraversalResult,
  SearchOptions,
  CreateThreadOptions,
  CreateAtomOptions,
  TraversalOptions,
  PredictionOptions,
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEY FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type-safe query key factory for Cortex queries
 *
 * Following TanStack Query best practices for query key organization.
 * @see https://tanstack.com/query/latest/docs/react/guides/query-keys
 *
 * @example
 * ```typescript
 * // Invalidate all cortex queries
 * queryClient.invalidateQueries({ queryKey: cortexKeys.all });
 *
 * // Invalidate specific search
 * queryClient.invalidateQueries({ queryKey: cortexKeys.search('my query') });
 * ```
 */
export const cortexKeys = {
  /** Root key for all Cortex queries */
  all: ['cortex'] as const,

  // Health & Status
  health: () => [...cortexKeys.all, 'health'] as const,
  stats: () => [...cortexKeys.all, 'stats'] as const,
  graphStats: () => [...cortexKeys.all, 'graph', 'stats'] as const,

  // Search
  searches: () => [...cortexKeys.all, 'search'] as const,
  search: (query: string, options?: SearchOptions) =>
    [...cortexKeys.searches(), { query, ...options }] as const,

  // Atoms
  atoms: () => [...cortexKeys.all, 'atoms'] as const,
  atom: (id: string) => [...cortexKeys.atoms(), id] as const,
  atomEdges: (id: string, direction?: string) =>
    [...cortexKeys.atom(id), 'edges', direction] as const,

  // Threads
  threads: () => [...cortexKeys.all, 'threads'] as const,
  thread: (id: string) => [...cortexKeys.threads(), id] as const,
  threadTraces: (id: string) => [...cortexKeys.thread(id), 'traces'] as const,
  threadContext: (id: string) => [...cortexKeys.thread(id), 'context'] as const,

  // Advisory
  advisory: () => [...cortexKeys.all, 'advisory'] as const,
  advisoryProject: (projectId: string) => [...cortexKeys.advisory(), 'project', projectId] as const,
  signals: (submissionType: string, therapeuticArea?: string) =>
    [...cortexKeys.advisory(), 'signals', { submissionType, therapeuticArea }] as const,
  patterns: () => [...cortexKeys.advisory(), 'patterns'] as const,

  // Graph
  graph: () => [...cortexKeys.all, 'graph'] as const,
  traversal: (startAtomId: string, options?: TraversalOptions) =>
    [...cortexKeys.graph(), 'traverse', { startAtomId, ...options }] as const,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Default stale times for different query types */
const STALE_TIMES = {
  health: 30 * 1000, // 30 seconds
  stats: 5 * 60 * 1000, // 5 minutes
  search: 5 * 60 * 1000, // 5 minutes
  atom: 10 * 60 * 1000, // 10 minutes
  thread: 30 * 1000, // 30 seconds (threads are interactive)
  advisory: 15 * 60 * 1000, // 15 minutes
  signals: 30 * 60 * 1000, // 30 minutes (signals change infrequently)
  graph: 5 * 60 * 1000, // 5 minutes
} as const;

/** Minimum search query length */
const MIN_SEARCH_LENGTH = 3;

/** Debounce delay for search (ms) */
const SEARCH_DEBOUNCE_MS = 300;

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Custom hook for debounced values
 */
function useDebounce<T>(value: T, delay: number): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const debouncedRef = useRef<T>(value);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      debouncedRef.current = value;
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return debouncedRef.current;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH & STATUS HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to check Cortex Prime health status
 *
 * Automatically polls for health status and provides connection state.
 *
 * @example
 * ```typescript
 * const { data: health, isHealthy, isLoading, error } = useCortexHealth();
 *
 * if (!isHealthy) {
 *   return <ConnectionError />;
 * }
 * ```
 */
export function useCortexHealth(
  options?: Omit<UseQueryOptions<CortexHealth, CortexError>, 'queryKey' | 'queryFn'>
) {
  const query = useQuery({
    queryKey: cortexKeys.health(),
    queryFn: () => cortexClient.getHealth(),
    staleTime: STALE_TIMES.health,
    refetchInterval: 60 * 1000, // Poll every minute
    retry: 2,
    ...options,
  });

  return {
    ...query,
    /** Convenience boolean for health status */
    isHealthy: query.data?.status === 'healthy',
    /** True if service is degraded but functional */
    isDegraded: query.data?.status === 'degraded',
    /** True if service is completely unavailable */
    isUnhealthy: query.data?.status === 'unhealthy',
  };
}

/**
 * Hook to get Cortex statistics
 *
 * @example
 * ```typescript
 * const { data: stats, isLoading } = useCortexStats();
 * console.log(`${stats?.atomCount} knowledge atoms`);
 * ```
 */
export function useCortexStats(
  options?: Omit<UseQueryOptions<CortexStats, CortexError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cortexKeys.stats(),
    queryFn: () => cortexClient.getStats(),
    staleTime: STALE_TIMES.stats,
    ...options,
  });
}

/**
 * Hook to get graph statistics
 *
 * @example
 * ```typescript
 * const { data: graphStats } = useCortexGraphStats();
 * console.log(`Graph density: ${graphStats?.graphDensity}`);
 * ```
 */
export function useCortexGraphStats(
  options?: Omit<UseQueryOptions<GraphStats, CortexError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cortexKeys.graphStats(),
    queryFn: () => cortexClient.getGraphStats(),
    staleTime: STALE_TIMES.graph,
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for semantic search with automatic debouncing
 *
 * Designed for search-as-you-type experiences with proper caching.
 *
 * @example
 * ```typescript
 * const [query, setQuery] = useState('');
 * const { data: results, isLoading, isDebouncing } = useCortexSearch(query, {
 *   atomTypes: ['regulatory_guidance'],
 *   limit: 20
 * });
 *
 * return (
 *   <SearchInput
 *     value={query}
 *     onChange={setQuery}
 *     loading={isLoading || isDebouncing}
 *     results={results}
 *   />
 * );
 * ```
 */
export function useCortexSearch(query: string, options?: SearchOptions) {
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const isValidQuery = debouncedQuery.length >= MIN_SEARCH_LENGTH;

  const queryResult = useQuery({
    queryKey: cortexKeys.search(debouncedQuery, options),
    queryFn: () => cortexClient.search(debouncedQuery, options),
    enabled: isValidQuery,
    staleTime: STALE_TIMES.search,
    placeholderData: previousData => previousData, // Keep showing old results while fetching
  });

  return {
    ...queryResult,
    /** True if query is being debounced */
    isDebouncing: query !== debouncedQuery,
    /** True if query is too short */
    isQueryTooShort: query.length > 0 && query.length < MIN_SEARCH_LENGTH,
  };
}

/**
 * Mutation hook for on-demand search (not debounced)
 *
 * Use this when you need explicit control over when searches happen.
 *
 * @example
 * ```typescript
 * const searchMutation = useCortexSearchMutation();
 *
 * const handleSearch = async (query: string) => {
 *   const results = await searchMutation.mutateAsync({ query });
 *   console.log(`Found ${results.length} results`);
 * };
 * ```
 */
export function useCortexSearchMutation(
  options?: UseMutationOptions<
    CortexSearchResult[],
    CortexError,
    { query: string; options?: SearchOptions }
  >
) {
  return useMutation({
    mutationFn: ({ query, options }) => cortexClient.search(query, options),
    ...options,
  });
}

/**
 * Mutation hook for generating embeddings
 *
 * @example
 * ```typescript
 * const embedMutation = useCortexEmbed();
 * const embedding = await embedMutation.mutateAsync('regulatory text');
 * ```
 */
export function useCortexEmbed(
  options?: UseMutationOptions<number[], CortexError, { text: string; model?: '1536' | '3072' }>
) {
  return useMutation({
    mutationFn: ({ text, model }) => cortexClient.embed(text, model),
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATOM HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch a single atom by ID
 *
 * @example
 * ```typescript
 * const { data: atom, isLoading, error } = useCortexAtom('uuid');
 *
 * if (atom) {
 *   console.log(`${atom.atomType}: ${atom.content}`);
 * }
 * ```
 */
export function useCortexAtom(
  atomId: string,
  options?: Omit<UseQueryOptions<CortexAtom | null, CortexError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cortexKeys.atom(atomId),
    queryFn: () => cortexClient.getAtom(atomId),
    enabled: !!atomId,
    staleTime: STALE_TIMES.atom,
    ...options,
  });
}

/**
 * Hook to fetch edges connected to an atom
 *
 * @example
 * ```typescript
 * const { data: edges } = useCortexAtomEdges('atom-uuid', 'outgoing');
 * const relatedAtomIds = edges?.map(e => e.targetAtomId);
 * ```
 */
export function useCortexAtomEdges(
  atomId: string,
  direction?: 'incoming' | 'outgoing' | 'both',
  options?: Omit<UseQueryOptions<CortexEdge[], CortexError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cortexKeys.atomEdges(atomId, direction),
    queryFn: () => cortexClient.getAtomEdges(atomId, direction),
    enabled: !!atomId,
    staleTime: STALE_TIMES.atom,
    ...options,
  });
}

/**
 * Mutation hook to create a new atom with optimistic update
 *
 * @example
 * ```typescript
 * const createAtom = useCreateCortexAtom();
 *
 * const handleCreate = async () => {
 *   const atom = await createAtom.mutateAsync({
 *     atomType: 'insight',
 *     content: 'New regulatory insight'
 *   });
 *   console.log(`Created atom: ${atom.id}`);
 * };
 * ```
 */
export function useCreateCortexAtom(
  options?: UseMutationOptions<CortexAtom, CortexError, CreateAtomOptions>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: atomOptions => cortexClient.createAtom(atomOptions),
    onSuccess: newAtom => {
      // Add to cache
      queryClient.setQueryData(cortexKeys.atom(newAtom.id), newAtom);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: cortexKeys.stats() });
      queryClient.invalidateQueries({ queryKey: cortexKeys.graphStats() });
      queryClient.invalidateQueries({ queryKey: cortexKeys.searches() });
    },
    ...options,
  });
}

/**
 * Mutation hook to update an atom with optimistic update
 *
 * @example
 * ```typescript
 * const updateAtom = useUpdateCortexAtom();
 *
 * await updateAtom.mutateAsync({
 *   atomId: 'uuid',
 *   updates: { content: 'Updated content' }
 * });
 * ```
 */
export function useUpdateCortexAtom(
  options?: UseMutationOptions<
    CortexAtom,
    CortexError,
    { atomId: string; updates: Partial<CortexAtom> },
    { previousAtom: CortexAtom | undefined }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ atomId, updates }) => cortexClient.updateAtom(atomId, updates),
    onMutate: async ({ atomId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: cortexKeys.atom(atomId) });

      // Snapshot current value
      const previousAtom = queryClient.getQueryData<CortexAtom>(cortexKeys.atom(atomId));

      // Optimistic update
      if (previousAtom) {
        queryClient.setQueryData(cortexKeys.atom(atomId), {
          ...previousAtom,
          ...updates,
          updatedAt: new Date(),
        });
      }

      return { previousAtom };
    },
    onError: (_error, { atomId }, context) => {
      // Rollback on error
      if (context?.previousAtom) {
        queryClient.setQueryData(cortexKeys.atom(atomId), context.previousAtom);
      }
    },
    onSettled: (_, __, { atomId }) => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: cortexKeys.atom(atomId) });
    },
    ...options,
  });
}

/**
 * Mutation hook to deactivate (soft delete) an atom
 */
export function useDeactivateCortexAtom(
  options?: UseMutationOptions<{ success: boolean }, CortexError, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: atomId => cortexClient.deactivateAtom(atomId),
    onSuccess: (_, atomId) => {
      queryClient.invalidateQueries({ queryKey: cortexKeys.atom(atomId) });
      queryClient.invalidateQueries({ queryKey: cortexKeys.stats() });
      queryClient.invalidateQueries({ queryKey: cortexKeys.graphStats() });
    },
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mutation hook to create an edge between atoms
 *
 * @example
 * ```typescript
 * const createEdge = useCreateCortexEdge();
 *
 * await createEdge.mutateAsync({
 *   sourceAtomId: 'uuid-1',
 *   targetAtomId: 'uuid-2',
 *   edgeType: 'supports',
 *   strength: 0.9
 * });
 * ```
 */
export function useCreateCortexEdge(
  options?: UseMutationOptions<
    CortexEdge,
    CortexError,
    {
      sourceAtomId: string;
      targetAtomId: string;
      edgeType: string;
      strength?: number;
      evidence?: Record<string, unknown>;
    }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: edge => cortexClient.createEdge(edge),
    onSuccess: (_, { sourceAtomId, targetAtomId }) => {
      // Invalidate edge queries for both atoms
      queryClient.invalidateQueries({ queryKey: cortexKeys.atomEdges(sourceAtomId) });
      queryClient.invalidateQueries({ queryKey: cortexKeys.atomEdges(targetAtomId) });
      queryClient.invalidateQueries({ queryKey: cortexKeys.graphStats() });
    },
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREAD HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch a conversation thread
 *
 * @example
 * ```typescript
 * const { data: thread, isLoading } = useCortexThread('thread-uuid');
 * ```
 */
export function useCortexThread(
  threadId: string,
  options?: Omit<UseQueryOptions<CortexThread | null, CortexError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cortexKeys.thread(threadId),
    queryFn: () => cortexClient.getThread(threadId),
    enabled: !!threadId,
    staleTime: STALE_TIMES.thread,
    ...options,
  });
}

/**
 * Hook to fetch thread traces (interaction history)
 *
 * @example
 * ```typescript
 * const { data: traces } = useCortexThreadTraces('thread-uuid');
 * ```
 */
export function useCortexThreadTraces(
  threadId: string,
  options?: Omit<UseQueryOptions<CortexTrace[], CortexError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cortexKeys.threadTraces(threadId),
    queryFn: () => cortexClient.getThreadTraces(threadId),
    enabled: !!threadId,
    staleTime: STALE_TIMES.thread,
    ...options,
  });
}

/**
 * Mutation hook to create a new thread
 *
 * @example
 * ```typescript
 * const createThread = useCreateCortexThread();
 *
 * const thread = await createThread.mutateAsync({
 *   title: 'IND Review Discussion',
 *   threadType: 'review'
 * });
 * ```
 */
export function useCreateCortexThread(
  options?: UseMutationOptions<CortexThread, CortexError, CreateThreadOptions>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: threadOptions => cortexClient.createThread(threadOptions),
    onSuccess: newThread => {
      queryClient.setQueryData(cortexKeys.thread(newThread.id), newThread);
      queryClient.invalidateQueries({ queryKey: cortexKeys.stats() });
    },
    ...options,
  });
}

/**
 * Mutation hook to create a trace in a thread
 *
 * @example
 * ```typescript
 * const createTrace = useCreateCortexTrace();
 *
 * const trace = await createTrace.mutateAsync({
 *   threadId: 'thread-uuid',
 *   traceType: 'query',
 *   input: { question: 'What are the key risks?' }
 * });
 * ```
 */
export function useCreateCortexTrace(
  options?: UseMutationOptions<
    CortexTrace,
    CortexError,
    {
      threadId: string;
      agentId?: string;
      traceType?: string;
      input: Record<string, unknown>;
      reasoning?: Record<string, unknown>;
    }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: trace => cortexClient.createTrace(trace),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: cortexKeys.threadTraces(threadId) });
    },
    ...options,
  });
}

/**
 * Mutation hook to assemble context from a thread
 */
export function useAssembleCortexContext(
  options?: UseMutationOptions<
    {
      threadId: string;
      systemPrompt: string;
      conversationHistory: Array<{ role: string; content: string }>;
      relevantKnowledge: Array<{ atomId: string; content: string; relevance: number }>;
      totalTokens: number;
    },
    CortexError,
    { threadId: string; maxTokens?: number }
  >
) {
  return useMutation({
    mutationFn: ({ threadId, maxTokens }) => cortexClient.assembleContext(threadId, maxTokens),
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADVISORY & PREDICTION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to get full advisory analysis for a project
 *
 * @example
 * ```typescript
 * const { data: advisory, isLoading, error } = useCortexAdvisory('project-uuid');
 *
 * if (advisory) {
 *   console.log(`Risk level: ${advisory.overallRisk}`);
 *   console.log(`${advisory.recommendations.length} recommendations`);
 * }
 * ```
 */
export function useCortexAdvisory(
  projectId: string,
  options?: Omit<UseQueryOptions<AdvisoryResult, CortexError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cortexKeys.advisoryProject(projectId),
    queryFn: () => cortexClient.getAdvisory(projectId),
    enabled: !!projectId,
    staleTime: STALE_TIMES.advisory,
    ...options,
  });
}

/**
 * Mutation hook to generate a prediction
 *
 * @example
 * ```typescript
 * const predict = useCortexPrediction();
 *
 * const prediction = await predict.mutateAsync({
 *   submissionId: 'submission-uuid',
 *   options: { predictionType: 'approval_likelihood' }
 * });
 *
 * console.log(`Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
 * ```
 */
export function useCortexPrediction(
  options?: UseMutationOptions<
    IntuitionPrediction,
    CortexError,
    { submissionId: string; options?: PredictionOptions }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ submissionId, options }) => cortexClient.getPrediction(submissionId, options),
    onSuccess: () => {
      // Invalidate advisory caches
      queryClient.invalidateQueries({ queryKey: cortexKeys.advisory() });
    },
    ...options,
  });
}

/**
 * Hook to get regulatory signals
 *
 * @example
 * ```typescript
 * const { data: signals } = useCortexSignals('510k', 'cardiovascular');
 *
 * const criticalSignals = signals?.filter(s => s.urgencyLevel === 'critical');
 * ```
 */
export function useCortexSignals(
  submissionType: string,
  therapeuticArea?: string,
  options?: Omit<UseQueryOptions<RegulatorySignal[], CortexError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: cortexKeys.signals(submissionType, therapeuticArea),
    queryFn: () => cortexClient.getSignals(submissionType, therapeuticArea),
    enabled: !!submissionType,
    staleTime: STALE_TIMES.signals,
    ...options,
  });
}

/**
 * Mutation hook to match against rejection patterns
 *
 * @example
 * ```typescript
 * const matchPatterns = useCortexPatternMatch();
 *
 * const patterns = await matchPatterns.mutateAsync({
 *   deviceType: 'Class II',
 *   indicationsForUse: 'cardiac monitoring'
 * });
 *
 * const highRiskPatterns = patterns.filter(p => p.matchScore > 0.7);
 * ```
 */
export function useCortexPatternMatch(
  options?: UseMutationOptions<AdvisoryResult['patterns'], CortexError, Record<string, unknown>>
) {
  return useMutation({
    mutationFn: submissionContent => cortexClient.matchPatterns(submissionContent),
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH TRAVERSAL HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mutation hook to traverse the knowledge graph
 *
 * @example
 * ```typescript
 * const traverse = useCortexTraverse();
 *
 * const related = await traverse.mutateAsync({
 *   startAtomId: 'uuid',
 *   options: { maxDepth: 3, edgeTypes: ['supports', 'references'] }
 * });
 *
 * // Build visualization
 * const nodes = related.map(r => ({
 *   id: r.atomId,
 *   depth: r.depth,
 *   label: r.content.substring(0, 50)
 * }));
 * ```
 */
export function useCortexTraverse(
  options?: UseMutationOptions<
    TraversalResult[],
    CortexError,
    { startAtomId: string; options?: TraversalOptions }
  >
) {
  return useMutation({
    mutationFn: ({ startAtomId, options }) => cortexClient.traverse(startAtomId, options),
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNCERTAINTY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mutation hook to estimate uncertainty
 *
 * @example
 * ```typescript
 * const estimateUncertainty = useCortexUncertainty();
 *
 * const result = await estimateUncertainty.mutateAsync({
 *   contextType: 'submission',
 *   contextId: 'submission-uuid',
 *   inputData: { clinicalData: {...} }
 * });
 *
 * if (result.epistemicUncertainty > 0.3) {
 *   console.log('Need more data to reduce uncertainty');
 * }
 * ```
 */
export function useCortexUncertainty(
  options?: UseMutationOptions<
    UncertaintyEstimate,
    CortexError,
    { contextType: string; contextId: string; inputData: Record<string, unknown> }
  >
) {
  return useMutation({
    mutationFn: ({ contextType, contextId, inputData }) =>
      cortexClient.estimateUncertainty(contextType, contextId, inputData),
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED CONVENIENCE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Combined hook for common Cortex operations
 *
 * Provides a unified interface for the most common Cortex operations
 * with loading states and error handling.
 *
 * @example
 * ```typescript
 * const {
 *   isHealthy,
 *   isLoading,
 *   stats,
 *   search,
 *   predict,
 *   isSearching,
 *   isPredicting,
 *   searchError,
 *   predictError,
 * } = useCortex();
 *
 * // Check health before operations
 * if (!isHealthy) {
 *   return <ServiceUnavailable />;
 * }
 *
 * // Perform operations
 * const results = await search({ query: 'FDA guidance' });
 * const prediction = await predict({ submissionId: 'uuid' });
 * ```
 */
export function useCortex() {
  const health = useCortexHealth();
  const stats = useCortexStats();
  const searchMutation = useCortexSearchMutation();
  const predictMutation = useCortexPrediction();
  const patternMutation = useCortexPatternMatch();

  const search = useCallback(
    async (params: { query: string; options?: SearchOptions }) => {
      return searchMutation.mutateAsync(params);
    },
    [searchMutation]
  );

  const predict = useCallback(
    async (params: { submissionId: string; options?: PredictionOptions }) => {
      return predictMutation.mutateAsync(params);
    },
    [predictMutation]
  );

  const matchPatterns = useCallback(
    async (submissionContent: Record<string, unknown>) => {
      return patternMutation.mutateAsync(submissionContent);
    },
    [patternMutation]
  );

  return useMemo(
    () => ({
      // Status
      isHealthy: health.isHealthy,
      isDegraded: health.isDegraded,
      isUnhealthy: health.isUnhealthy,
      isLoading: health.isLoading,
      healthData: health.data,
      stats: stats.data,
      statsLoading: stats.isLoading,

      // Actions
      search,
      predict,
      matchPatterns,

      // Mutation states
      isSearching: searchMutation.isPending,
      isPredicting: predictMutation.isPending,
      isMatchingPatterns: patternMutation.isPending,

      // Results
      searchResults: searchMutation.data,
      predictionResult: predictMutation.data,
      patternResults: patternMutation.data,

      // Errors
      healthError: health.error,
      searchError: searchMutation.error,
      predictError: predictMutation.error,
      patternError: patternMutation.error,

      // Reset functions
      resetSearch: searchMutation.reset,
      resetPrediction: predictMutation.reset,
      resetPatterns: patternMutation.reset,
    }),
    [
      health,
      stats,
      search,
      predict,
      matchPatterns,
      searchMutation,
      predictMutation,
      patternMutation,
    ]
  );
}

// Default export
export default useCortex;
