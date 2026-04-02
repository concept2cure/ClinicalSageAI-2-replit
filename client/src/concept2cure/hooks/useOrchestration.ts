/**
 * Phase 3 — Orchestration React Hooks
 *
 * Hooks for consuming the orchestration API:
 * - useWorkflowExecution: Execute and track workflow progress
 * - useReadinessAssessment: Fetch readiness assessment for a project
 * - useRecommendations: Fetch predictive recommendations
 * - useContinuity: Fetch project continuity briefing
 * - useWorkflowTemplates: List available workflow templates
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// ---------------------------------------------------------------------------
// Types (mirrored from shared/types/orchestration.ts for client use)
// ---------------------------------------------------------------------------

export interface WorkflowExecution {
  executionId: string;
  templateId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  projectId: number;
  steps: Array<{
    stepId: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    durationMs?: number;
    errors?: Array<{ code: string; message: string }>;
    warnings?: string[];
    result?: Record<string, unknown>;
  }>;
  currentStepIndex: number;
  progressPercent: number;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  result?: WorkflowResult;
  auditTrail: Array<{
    timestamp: string;
    action: string;
    detail: string;
  }>;
}

export interface WorkflowResult {
  summary: string;
  blockers: Array<{
    severity: 'critical' | 'major' | 'minor';
    category: string;
    message: string;
    targetType?: string;
    targetId?: string | number;
    suggestedAction?: string;
  }>;
  recommendations: Recommendation[];
  readiness?: ReadinessAssessment;
  createdObjects: Array<{ type: string; id: string | number; title?: string }>;
  updatedObjects: Array<{ type: string; id: string | number; title?: string }>;
}

export interface ReadinessAssessment {
  projectId: number;
  overallScore: number;
  status: string;
  scores: {
    completeness: number;
    quality: number;
    consistency: number;
    compliance: number;
    routing: number;
  };
  moduleBreakdown: ModuleReadinessItem[];
  documentInventory: DocumentReadinessItem[];
  blockers: ReadinessBlocker[];
  recommendations: Recommendation[];
  assessedAt: string;
}

export interface ModuleReadinessItem {
  module: string;
  label: string;
  score: number;
  status: string;
  documentCount: number;
  expectedDocumentCount: number;
  validatedCount: number;
  routedCount: number;
  missingItems: string[];
  blockerCount: number;
}

export interface DocumentReadinessItem {
  documentId: number;
  title: string;
  type: string;
  status: string;
  module?: string;
  isDrafted: boolean;
  isValidated: boolean;
  isRouted: boolean;
  isApproved: boolean;
  isExportReady: boolean;
  validationScore?: number;
  criticalFindings: number;
  lastModified?: string;
  isStale: boolean;
}

export interface ReadinessBlocker {
  severity: 'critical' | 'major' | 'minor';
  category: string;
  message: string;
  targetType: string;
  targetId: string | number;
  targetTitle?: string;
  module?: string;
  suggestedResolution: string;
}

export interface Recommendation {
  id: string;
  recommendationType: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  targetObjectType: string;
  targetObjectId: string | number;
  targetObjectTitle?: string;
  reason: string;
  evidence: string[];
  suggestedAction: string;
  actionPayload?: {
    actionType: string;
    payload: Record<string, unknown>;
  };
  confidence: number;
  module?: string;
  generatedAt: string;
}

export interface RecommendationSet {
  projectId: number;
  recommendations: Recommendation[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  generatedAt: string;
}

export interface ContinuitySnapshot {
  projectId: number;
  snapshotAt: string;
  summary: string;
  changes: Array<{
    type: string;
    description: string;
    targetType: string;
    targetId: string | number;
    timestamp: string;
  }>;
  activeBlockers: ReadinessBlocker[];
  newlyReady: Array<{ type: string; id: number; title: string }>;
  needsAttention: Array<{ type: string; id: number; title: string; reason: string }>;
  nextActions: Recommendation[];
  trajectory: 'improving' | 'declining' | 'stable';
  metrics: {
    readinessScore: number;
    documentCount: number;
    validatedCount: number;
    blockerCount: number;
    taskCompletionPercent: number;
  };
}

export interface WorkflowTemplateInfo {
  templateId: string;
  name: string;
  description: string;
  stepCount: number;
  estimatedDurationMinutes?: number;
  applicableModules?: string[];
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function orchPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await apiRequest('POST', `/api/orchestration${path}`, body);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function orchGet<T>(path: string): Promise<T> {
  const res = await apiRequest('GET', `/api/orchestration${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// useWorkflowExecution
// ---------------------------------------------------------------------------

export function useWorkflowExecution() {
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const execute = useCallback(
    async (params: {
      templateId: string;
      projectId: number;
      module?: string;
      targetType?: string;
      targetId?: string | number;
      context?: Record<string, unknown>;
    }) => {
      setIsRunning(true);
      setError(null);
      try {
        const result = await orchPost<WorkflowExecution>('/execute', params);
        setExecution(result);
        // Invalidate related queries
        queryClient.invalidateQueries({ queryKey: ['readiness', params.projectId] });
        queryClient.invalidateQueries({ queryKey: ['recommendations', params.projectId] });
        queryClient.invalidateQueries({ queryKey: ['continuity', params.projectId] });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Workflow failed';
        setError(msg);
        throw err;
      } finally {
        setIsRunning(false);
      }
    },
    [queryClient]
  );

  const cancel = useCallback(async (executionId: string) => {
    await orchPost('/cancel/' + executionId, {});
    setExecution((prev) => prev ? { ...prev, status: 'cancelled' } : null);
  }, []);

  const reset = useCallback(() => {
    setExecution(null);
    setError(null);
    setIsRunning(false);
  }, []);

  return { execute, cancel, reset, execution, isRunning, error };
}

// ---------------------------------------------------------------------------
// useReadinessAssessment
// ---------------------------------------------------------------------------

export function useReadinessAssessment(projectId: number | null, module?: string) {
  return useQuery<ReadinessAssessment>({
    queryKey: ['readiness', projectId, module],
    queryFn: () => orchPost('/readiness', { projectId, module }),
    enabled: !!projectId,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false,
  });
}

// ---------------------------------------------------------------------------
// useRecommendations
// ---------------------------------------------------------------------------

export function useRecommendations(
  projectId: number | null,
  options?: { module?: string; types?: string[]; minSeverity?: string; limit?: number }
) {
  return useQuery<RecommendationSet>({
    queryKey: ['recommendations', projectId, options],
    queryFn: () =>
      orchPost('/recommendations', {
        projectId,
        ...options,
      }),
    enabled: !!projectId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ---------------------------------------------------------------------------
// useContinuity
// ---------------------------------------------------------------------------

export function useContinuity(projectId: number | null) {
  const generateMutation = useMutation({
    mutationFn: (pid: number) => orchPost<ContinuitySnapshot>('/continuity', { projectId: pid }),
  });

  const latestQuery = useQuery<ContinuitySnapshot>({
    queryKey: ['continuity', projectId],
    queryFn: () => orchGet(`/continuity/${projectId}`),
    enabled: !!projectId,
    staleTime: 5 * 60_000, // 5 minutes
    retry: false, // Don't retry 404s
  });

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const result = await generateMutation.mutateAsync(projectId);
    return result;
  }, [projectId, generateMutation]);

  return {
    snapshot: latestQuery.data || generateMutation.data,
    isLoading: latestQuery.isLoading || generateMutation.isPending,
    error: latestQuery.error || generateMutation.error,
    refresh,
  };
}

// ---------------------------------------------------------------------------
// useWorkflowTemplates
// ---------------------------------------------------------------------------

export function useWorkflowTemplates() {
  return useQuery<{ templates: WorkflowTemplateInfo[] }>({
    queryKey: ['workflow-templates'],
    queryFn: () => orchGet('/templates'),
    staleTime: 10 * 60_000, // 10 minutes
  });
}
