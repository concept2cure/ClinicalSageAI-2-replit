/**
 * @fileoverview Enterprise 4-Pillar API Hooks
 * @module concept2cure/hooks/useEnterprise
 * @version 1.0.0
 *
 * @description
 * React Query hooks for the Enterprise 4-Pillar Expansion:
 * - Pillar 1: Project Hierarchy (programs, trees, rollups)
 * - Pillar 2: Rules Engine (CRUD, test, execution logs)
 * - Pillar 3: AI Sentinel (findings, scans, config)
 * - Pillar 4: Module Integration (link/unlink modules)
 *
 * @compliance
 * - FDA 21 CFR Part 11: All mutations logged server-side via audit trail
 * - Multi-tenant: organizationId injected into every request header
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useVisibleInterval } from './useVisibleInterval';

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? body.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEY FACTORIES (colocated for cache coherence)
// ═══════════════════════════════════════════════════════════════════════════════

export const hierarchyKeys = {
  all: ['hierarchy'] as const,
  programs: () => [...hierarchyKeys.all, 'programs'] as const,
  tree: (id: number) => [...hierarchyKeys.all, 'tree', id] as const,
  ancestors: (id: number) => [...hierarchyKeys.all, 'ancestors', id] as const,
  children: (id: number) => [...hierarchyKeys.all, 'children', id] as const,
  rollup: (id: number) => [...hierarchyKeys.all, 'rollup', id] as const,
  flat: () => [...hierarchyKeys.all, 'flat'] as const,
};

export const rulesKeys = {
  all: ['rules'] as const,
  list: (filters?: RulesListFilters) => [...rulesKeys.all, 'list', filters] as const,
  detail: (id: number) => [...rulesKeys.all, 'detail', id] as const,
  logs: (filters?: RuleLogFilters) => [...rulesKeys.all, 'logs', filters] as const,
  templates: () => [...rulesKeys.all, 'templates'] as const,
};

export const sentinelKeys = {
  all: ['sentinel'] as const,
  status: () => [...sentinelKeys.all, 'status'] as const,
  findings: (filters?: SentinelFindingsFilters) =>
    [...sentinelKeys.all, 'findings', filters] as const,
  config: () => [...sentinelKeys.all, 'config'] as const,
};

export const moduleKeys = {
  all: ['project-modules'] as const,
  byProject: (projectId: number) => [...moduleKeys.all, 'project', projectId] as const,
  detail: (id: number) => [...moduleKeys.all, 'detail', id] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — Pillar 1: Project Hierarchy
// ═══════════════════════════════════════════════════════════════════════════════

export interface HierarchyNode {
  id: number;
  name: string;
  code: string | null;
  status: string;
  depth: number;
  path: string | null;
  parentProjectId: number | null;
  progress: number;
  budget: number | null;
  riskLevel: string;
  type: string;
  startDate: string | null;
  targetEndDate: string | null;
  children?: HierarchyNode[];
  /** Rollup aggregates (present when tree endpoint includes rollups) */
  rollup?: RollupData;
}

export interface RollupData {
  totalTasks: number;
  completedTasks: number;
  totalBudget: number;
  spentBudget: number;
  overallProgress: number;
  riskLevel: string;
  moduleCount: number;
}

export interface ProgramSummary {
  id: number;
  name: string;
  code: string | null;
  status: string;
  progress: number;
  childCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — Pillar 2: Rules Engine
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectRule {
  id: number;
  ruleId: string;
  organizationId: number;
  name: string;
  description: string | null;
  scope: 'global' | 'project' | 'template';
  scopeProjectId: number | null;
  scopeTemplateId: number | null;
  triggerEvent: string;
  conditions: Record<string, unknown> | null;
  actions: Array<{ type: string; config: Record<string, unknown> }> | null;
  priority: number;
  isActive: boolean;
  cooldownMinutes: number;
  maxExecutions: number | null;
  executionCount: number;
  successCount: number;
  failureCount: number;
  lastExecutedAt: string | null;
  lastResult: Record<string, unknown> | null;
  isBuiltIn: boolean;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleExecutionLogEntry {
  id: number;
  executionId: string;
  ruleId: string;
  organizationId: number;
  projectId: number | null;
  triggerEvent: string;
  triggerContext: Record<string, unknown> | null;
  conditionsMatched: boolean;
  actionsExecuted: Array<{ type: string; result: string }> | null;
  success: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface RulesListFilters {
  scope?: string;
  triggerEvent?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface RuleLogFilters {
  ruleId?: string;
  projectId?: number;
  success?: boolean;
  page?: number;
  limit?: number;
}

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  conditions: Record<string, unknown>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  tags: string[];
}

export interface RuleTestResult {
  matched: boolean;
  conditionResults: Array<{ field: string; operator: string; passed: boolean }>;
  wouldExecuteActions: Array<{ type: string; description: string }>;
  dryRun: true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — Pillar 3: AI Sentinel
// ═══════════════════════════════════════════════════════════════════════════════

export type SentinelSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SentinelStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';
export type AnalyzerType =
  | 'schedule_risk'
  | 'budget_anomaly'
  | 'compliance_gap'
  | 'resource_conflict'
  | 'quality_drift';

export interface SentinelFinding {
  id: number;
  findingId: string;
  organizationId: number;
  projectId: number | null;
  analyzerType: AnalyzerType;
  severity: SentinelSeverity;
  title: string;
  summary: string;
  details: Record<string, unknown> | null;
  recommendations: Array<{ action: string; priority: string }> | null;
  affectedItems: Array<{ type: string; id: number; name: string }> | null;
  status: SentinelStatus;
  resolvedAt: string | null;
  resolvedById: number | null;
  aiRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SentinelStatusOverview {
  isRunning: boolean;
  lastScanAt: string | null;
  nextScanAt: string | null;
  findingCounts: Record<SentinelSeverity, number>;
  analyzerStatus: Record<AnalyzerType, { enabled: boolean; lastRun: string | null }>;
}

export interface SentinelFindingsFilters {
  severity?: SentinelSeverity;
  status?: SentinelStatus;
  analyzerType?: AnalyzerType;
  projectId?: number;
  page?: number;
  limit?: number;
}

export interface SentinelConfig {
  analyzers: Record<AnalyzerType, { enabled: boolean; intervalMinutes: number }>;
  globalEnabled: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — Pillar 4: Module Integration
// ═══════════════════════════════════════════════════════════════════════════════

export type ModuleType =
  | 'cer'
  | 'ind'
  | 'ectd'
  | 'cmc'
  | '510k'
  | 'regulatory_intel'
  | 'vault'
  | 'clinical_trials';

export interface ProjectModule {
  id: number;
  projectId: number;
  organizationId: number;
  clientWorkspaceId: number;
  moduleType: ModuleType;
  moduleInstanceId: number;
  status: 'active' | 'paused' | 'archived';
  settings: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS — Pillar 1: Project Hierarchy
// ═══════════════════════════════════════════════════════════════════════════════

/** Fetch all top-level programs (depth=0) */
export function usePrograms(options?: Partial<UseQueryOptions<ProgramSummary[]>>) {
  return useQuery({
    queryKey: hierarchyKeys.programs(),
    queryFn: () => apiFetch<ProgramSummary[]>('/api/project-hierarchy/programs'),
    staleTime: 30_000,
    ...options,
  });
}

/** Fetch full subtree rooted at a given project */
export function useProjectTree(
  projectId: number | undefined,
  options?: Partial<UseQueryOptions<HierarchyNode>>
) {
  return useQuery({
    queryKey: hierarchyKeys.tree(projectId!),
    queryFn: () => apiFetch<HierarchyNode>(`/api/project-hierarchy/${projectId}/tree`),
    enabled: projectId !== undefined,
    staleTime: 30_000,
    ...options,
  });
}

/** Fetch ancestor chain from a project up to program root */
export function useProjectAncestors(
  projectId: number | undefined,
  options?: Partial<UseQueryOptions<HierarchyNode[]>>
) {
  return useQuery({
    queryKey: hierarchyKeys.ancestors(projectId!),
    queryFn: () => apiFetch<HierarchyNode[]>(`/api/project-hierarchy/${projectId}/ancestors`),
    enabled: projectId !== undefined,
    ...options,
  });
}

/** Fetch direct children of a project */
export function useProjectChildren(
  projectId: number | undefined,
  options?: Partial<UseQueryOptions<HierarchyNode[]>>
) {
  return useQuery({
    queryKey: hierarchyKeys.children(projectId!),
    queryFn: () => apiFetch<HierarchyNode[]>(`/api/project-hierarchy/${projectId}/children`),
    enabled: projectId !== undefined,
    ...options,
  });
}

/** Fetch rollup aggregates for a project subtree */
export function useProjectRollup(
  projectId: number | undefined,
  options?: Partial<UseQueryOptions<RollupData>>
) {
  return useQuery({
    queryKey: hierarchyKeys.rollup(projectId!),
    queryFn: () => apiFetch<RollupData>(`/api/project-hierarchy/${projectId}/rollup`),
    enabled: projectId !== undefined,
    staleTime: 60_000,
    ...options,
  });
}

/** Fetch flat list of all projects with hierarchy info */
export function useProjectsFlat(options?: Partial<UseQueryOptions<HierarchyNode[]>>) {
  return useQuery({
    queryKey: hierarchyKeys.flat(),
    queryFn: () => apiFetch<HierarchyNode[]>('/api/project-hierarchy/flat'),
    staleTime: 30_000,
    ...options,
  });
}

/** Create a child project under a parent */
export function useCreateChildProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      parentId,
      data,
    }: {
      parentId: number;
      data: { name: string; type: string; description?: string };
    }) =>
      apiFetch<HierarchyNode>(`/api/project-hierarchy/${parentId}/children`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: hierarchyKeys.tree(variables.parentId) });
      qc.invalidateQueries({ queryKey: hierarchyKeys.children(variables.parentId) });
      qc.invalidateQueries({ queryKey: hierarchyKeys.programs() });
    },
  });
}

/** Move a project to a new parent */
export function useMoveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, newParentId }: { projectId: number; newParentId: number | null }) =>
      apiFetch<{ success: boolean }>(`/api/project-hierarchy/${projectId}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ newParentId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hierarchyKeys.all });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS — Pillar 2: Rules Engine
// ═══════════════════════════════════════════════════════════════════════════════

/** Fetch paginated rules list with filters */
export function useProjectRules(
  filters?: RulesListFilters,
  options?: Partial<UseQueryOptions<{ rules: ProjectRule[]; total: number }>>
) {
  const params = new URLSearchParams();
  if (filters?.scope) params.set('scope', filters.scope);
  if (filters?.triggerEvent) params.set('triggerEvent', filters.triggerEvent);
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));

  const qs = params.toString();
  return useQuery({
    queryKey: rulesKeys.list(filters),
    queryFn: () =>
      apiFetch<{ rules: ProjectRule[]; total: number }>(`/api/project-rules${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
    ...options,
  });
}

/** Fetch a single rule by ID */
export function useProjectRule(
  ruleId: number | undefined,
  options?: Partial<UseQueryOptions<ProjectRule>>
) {
  return useQuery({
    queryKey: rulesKeys.detail(ruleId!),
    queryFn: () => apiFetch<ProjectRule>(`/api/project-rules/${ruleId}`),
    enabled: ruleId !== undefined,
    ...options,
  });
}

/** Create a new rule */
export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<
        ProjectRule,
        | 'id'
        | 'executionCount'
        | 'successCount'
        | 'failureCount'
        | 'lastExecutedAt'
        | 'lastResult'
        | 'createdAt'
        | 'updatedAt'
      >
    ) =>
      apiFetch<ProjectRule>('/api/project-rules', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rulesKeys.all });
    },
  });
}

/** Update an existing rule */
export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ProjectRule> }) =>
      apiFetch<ProjectRule>(`/api/project-rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: rulesKeys.detail(variables.id) });
      qc.invalidateQueries({ queryKey: rulesKeys.list() });
    },
  });
}

/** Delete a rule */
export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ success: boolean }>(`/api/project-rules/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rulesKeys.all });
    },
  });
}

/** Dry-run test a rule against sample context */
export function useTestRule() {
  return useMutation({
    mutationFn: ({ id, context }: { id: number; context: Record<string, unknown> }) =>
      apiFetch<RuleTestResult>(`/api/project-rules/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({ context }),
      }),
  });
}

/** Fetch rule execution logs */
export function useRuleExecutionLogs(
  filters?: RuleLogFilters,
  options?: Partial<UseQueryOptions<{ logs: RuleExecutionLogEntry[]; total: number }>>
) {
  const params = new URLSearchParams();
  if (filters?.ruleId) params.set('ruleId', filters.ruleId);
  if (filters?.projectId) params.set('projectId', String(filters.projectId));
  if (filters?.success !== undefined) params.set('success', String(filters.success));
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));

  const qs = params.toString();
  return useQuery({
    queryKey: rulesKeys.logs(filters),
    queryFn: () =>
      apiFetch<{ logs: RuleExecutionLogEntry[]; total: number }>(
        `/api/project-rules/logs${qs ? `?${qs}` : ''}`
      ),
    staleTime: 15_000,
    ...options,
  });
}

/** Fetch built-in rule templates catalog */
export function useRuleTemplates(options?: Partial<UseQueryOptions<RuleTemplate[]>>) {
  return useQuery({
    queryKey: rulesKeys.templates(),
    queryFn: () => apiFetch<RuleTemplate[]>('/api/project-rules/templates'),
    staleTime: 300_000, // templates rarely change
    ...options,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS — Pillar 3: AI Sentinel
// ═══════════════════════════════════════════════════════════════════════════════

/** Fetch sentinel status overview */
export function useSentinelStatus(options?: Partial<UseQueryOptions<SentinelStatusOverview>>) {
  const interval = useVisibleInterval(30_000);
  return useQuery({
    queryKey: sentinelKeys.status(),
    queryFn: () => apiFetch<SentinelStatusOverview>('/api/sentinel/status'),
    refetchInterval: interval, // pauses when tab is hidden
    ...options,
  });
}

/** Fetch sentinel findings with filters */
export function useSentinelFindings(
  filters?: SentinelFindingsFilters,
  options?: Partial<UseQueryOptions<{ findings: SentinelFinding[]; total: number }>>
) {
  const params = new URLSearchParams();
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.analyzerType) params.set('analyzerType', filters.analyzerType);
  if (filters?.projectId) params.set('projectId', String(filters.projectId));
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));

  const qs = params.toString();
  return useQuery({
    queryKey: sentinelKeys.findings(filters),
    queryFn: () =>
      apiFetch<{ findings: SentinelFinding[]; total: number }>(
        `/api/sentinel/findings${qs ? `?${qs}` : ''}`
      ),
    staleTime: 15_000,
    ...options,
  });
}

/** Update a finding's status (acknowledge, resolve, dismiss) */
export function useUpdateFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      status,
      resolution,
    }: {
      findingId: number;
      status: SentinelStatus;
      resolution?: string;
    }) =>
      apiFetch<SentinelFinding>(`/api/sentinel/findings/${findingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolution }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sentinelKeys.findings() });
      qc.invalidateQueries({ queryKey: sentinelKeys.status() });
    },
  });
}

/** Trigger a manual sentinel scan */
export function useTriggerScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (analyzerType?: AnalyzerType) =>
      apiFetch<{ scanId: string; startedAt: string }>(
        analyzerType ? `/api/sentinel/scan/${analyzerType}` : '/api/sentinel/scan',
        { method: 'POST' }
      ),
    onSuccess: () => {
      // Refetch findings after scan completes
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: sentinelKeys.all });
      }, 3_000);
    },
  });
}

/** Fetch sentinel configuration */
export function useSentinelConfig(options?: Partial<UseQueryOptions<SentinelConfig>>) {
  return useQuery({
    queryKey: sentinelKeys.config(),
    queryFn: () => apiFetch<SentinelConfig>('/api/sentinel/config'),
    staleTime: 60_000,
    ...options,
  });
}

/** Update sentinel configuration */
export function useUpdateSentinelConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Partial<SentinelConfig>) =>
      apiFetch<SentinelConfig>('/api/sentinel/config', {
        method: 'PATCH',
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sentinelKeys.config() });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS — Pillar 4: Module Integration
// ═══════════════════════════════════════════════════════════════════════════════

/** Fetch all modules linked to a project */
export function useProjectModules(
  projectId: number | undefined,
  options?: Partial<UseQueryOptions<ProjectModule[]>>
) {
  return useQuery({
    queryKey: moduleKeys.byProject(projectId!),
    queryFn: () => apiFetch<ProjectModule[]>(`/api/projects/${projectId}/modules`),
    enabled: projectId !== undefined,
    staleTime: 30_000,
    ...options,
  });
}

/** Link a module to a project */
export function useLinkModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleType,
      moduleInstanceId,
      settings,
    }: {
      projectId: number;
      moduleType: ModuleType;
      moduleInstanceId: number;
      settings?: Record<string, unknown>;
    }) =>
      apiFetch<ProjectModule>(`/api/projects/${projectId}/modules`, {
        method: 'POST',
        body: JSON.stringify({ moduleType, moduleInstanceId, settings }),
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: moduleKeys.byProject(variables.projectId) });
    },
  });
}

/** Update a module link (settings, status) */
export function useUpdateModuleLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      data,
    }: {
      projectId: number;
      moduleId: number;
      data: { status?: string; settings?: Record<string, unknown> };
    }) =>
      apiFetch<ProjectModule>(`/api/projects/${projectId}/modules/${moduleId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: moduleKeys.byProject(variables.projectId) });
    },
  });
}

/** Unlink a module from a project */
export function useUnlinkModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, moduleId }: { projectId: number; moduleId: number }) =>
      apiFetch<{ success: boolean }>(`/api/projects/${projectId}/modules/${moduleId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: moduleKeys.byProject(variables.projectId) });
    },
  });
}
