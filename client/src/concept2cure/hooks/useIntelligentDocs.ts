/**
 * Phase 5: Intelligent Document System - Client API Hooks
 * 
 * React Query hooks for:
 * - Source document management
 * - Traceability links
 * - Change propagation
 * - Compliance scoring
 * 
 * All hooks include:
 * - Optimistic updates where applicable
 * - Cache invalidation
 * - Error handling
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceDocument {
  id: string;
  title: string;
  documentType: 'clinical_study' | 'regulatory_guidance' | 'literature' | 'internal_sop' | 'device_spec' | 'test_report' | 'other';
  version: string;
  contentHash: string;
  excerpt?: string;
  externalUrl?: string;
  externalRef?: string;
  citationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TraceabilityLink {
  id: string;
  sourceDocumentId: string;
  sourceHash: string;
  sourceVersion: string;
  targetDocumentId: string;
  targetSectionId?: string;
  targetRangeFrom?: number;
  targetRangeTo?: number;
  linkedText: string;
  citationType: 'direct_quote' | 'paraphrase' | 'reference' | 'data_source';
  confidence: number;
  verificationStatus: 'valid' | 'outdated' | 'broken' | 'pending';
  verifiedAt?: string;
  verifiedBy?: string;
  linkHash: string;
  createdAt: string;
  createdBy: string;
  // Joined fields
  sourceTitle?: string;
  sourceType?: string;
}

export interface PropagationEvent {
  id: string;
  sourceDocumentId: string;
  sourceTitle?: string;
  oldVersion: string;
  newVersion: string;
  oldHash: string;
  newHash: string;
  changeType: 'content_update' | 'version_bump' | 'correction' | 'withdrawal' | 'replacement';
  semanticChanges: Array<{ type: string; description: string; severity: string }>;
  impactedLinksCount: number;
  status: 'pending' | 'in_progress' | 'resolved' | 'dismissed';
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface ImpactedSection {
  id: string;
  propagationEventId: string;
  documentId: string;
  sectionId?: string;
  linkedText: string;
  linkId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  suggestedAction: 'update_required' | 'review_needed' | 'verify_accuracy' | 'no_action';
  suggestedPatchText?: string;
  patchConfidence?: number;
  resolutionStatus: 'pending' | 'accepted' | 'rejected' | 'modified';
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ComplianceScore {
  documentId: string;
  submissionType: string;
  overallScore: number;
  structureScore: number;
  contentScore: number;
  citationsScore: number;
  formatScore: number;
  completenessScore: number;
  regulatoryScore: number;
  dataIntegrityScore: number;
  signatureScore: number;
  passedRules: number;
  totalRules: number;
  violations: Array<{
    ruleId: string;
    severity: string;
    message: string;
  }>;
  calculatedAt: string;
}

export interface ComplianceRule {
  id: string;
  ruleId: string;
  name: string;
  description?: string;
  category: 'structure' | 'content' | 'citation' | 'format' | 'completeness' | 'regulatory' | 'data_integrity' | 'signature';
  severity: 'error' | 'warning' | 'info';
  applicableSubmissions: string[];
  regulatoryReference?: string;
  isActive: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Client
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = '/api/intelligent-docs';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-organization-id': getOrganizationId(),
    'x-user-id': getUserId(),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// These would be provided by auth context in production
function getOrganizationId(): string {
  return localStorage.getItem('organizationId') || 'default-org';
}

function getUserId(): string {
  return localStorage.getItem('userId') || 'current-user';
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const intelligentDocsKeys = {
  all: ['intelligent-docs'] as const,
  sources: () => [...intelligentDocsKeys.all, 'sources'] as const,
  sourcesList: (filters?: { search?: string; type?: string }) =>
    [...intelligentDocsKeys.sources(), 'list', filters] as const,
  source: (id: string) => [...intelligentDocsKeys.sources(), id] as const,
  links: () => [...intelligentDocsKeys.all, 'links'] as const,
  linksList: (filters?: { documentId?: string; sourceId?: string; status?: string }) =>
    [...intelligentDocsKeys.links(), 'list', filters] as const,
  link: (id: string) => [...intelligentDocsKeys.links(), id] as const,
  propagation: () => [...intelligentDocsKeys.all, 'propagation'] as const,
  propagationList: (filters?: { status?: string; sourceId?: string }) =>
    [...intelligentDocsKeys.propagation(), 'list', filters] as const,
  propagationImpacted: (eventId: string) =>
    [...intelligentDocsKeys.propagation(), eventId, 'impacted'] as const,
  compliance: () => [...intelligentDocsKeys.all, 'compliance'] as const,
  complianceHistory: (documentId: string) =>
    [...intelligentDocsKeys.compliance(), 'history', documentId] as const,
  complianceRules: (filters?: { submissionType?: string; category?: string }) =>
    [...intelligentDocsKeys.compliance(), 'rules', filters] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE DOCUMENTS HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useSourceDocuments(filters?: { search?: string; type?: string }) {
  return useQuery({
    queryKey: intelligentDocsKeys.sourcesList(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.type) params.set('type', filters.type);
      const query = params.toString() ? `?${params}` : '';
      return fetchApi<{ sources: SourceDocument[]; total: number }>(`/sources${query}`);
    },
  });
}

export function useCreateSourceDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<SourceDocument, 'id' | 'version' | 'contentHash' | 'citationCount' | 'createdAt' | 'updatedAt'>) => {
      return fetchApi<{ source: SourceDocument }>('/sources', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intelligentDocsKeys.sources() });
    },
  });
}

export function useUpdateSourceDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<SourceDocument> & { id: string }) => {
      return fetchApi<{ source: SourceDocument; previousVersion: string }>(`/sources/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: intelligentDocsKeys.sources() });
      queryClient.invalidateQueries({ queryKey: intelligentDocsKeys.links() });
      queryClient.invalidateQueries({ queryKey: intelligentDocsKeys.propagation() });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACEABILITY LINKS HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useTraceabilityLinks(filters?: { documentId?: string; sourceId?: string; status?: string }) {
  return useQuery({
    queryKey: intelligentDocsKeys.linksList(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.documentId) params.set('documentId', filters.documentId);
      if (filters?.sourceId) params.set('sourceId', filters.sourceId);
      if (filters?.status) params.set('status', filters.status);
      const query = params.toString() ? `?${params}` : '';
      return fetchApi<{ links: TraceabilityLink[] }>(`/links${query}`);
    },
    enabled: !!(filters?.documentId || filters?.sourceId),
  });
}

export function useCreateTraceabilityLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sourceDocumentId: string;
      targetDocumentId: string;
      targetSectionId?: string;
      targetRangeFrom?: number;
      targetRangeTo?: number;
      linkedText: string;
      citationType: TraceabilityLink['citationType'];
      confidence?: number;
    }) => {
      return fetchApi<{ link: TraceabilityLink }>('/links', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intelligentDocsKeys.links() });
      queryClient.invalidateQueries({ queryKey: intelligentDocsKeys.sources() });
    },
  });
}

export function useVerifyTraceabilityLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: string) => {
      return fetchApi<{
        linkId: string;
        status: string;
        sourceHashMatch: boolean;
        currentVersion: string;
      }>(`/links/${linkId}/verify`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intelligentDocsKeys.links() });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE PROPAGATION HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function usePropagationEvents(filters?: { status?: string; sourceId?: string }) {
  return useQuery({
    queryKey: intelligentDocsKeys.propagationList(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.sourceId) params.set('sourceId', filters.sourceId);
      const query = params.toString() ? `?${params}` : '';
      return fetchApi<{ events: PropagationEvent[] }>(`/propagation-events${query}`);
    },
  });
}

export function useImpactedSections(eventId: string) {
  return useQuery({
    queryKey: intelligentDocsKeys.propagationImpacted(eventId),
    queryFn: async () => {
      return fetchApi<{ impactedSections: ImpactedSection[] }>(
        `/propagation-events/${eventId}/impacted`
      );
    },
    enabled: !!eventId,
  });
}

export function useResolvePropagationEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      return fetchApi<{ success: boolean; eventId: string; status: string }>(
        `/propagation-events/${eventId}/resolve`,
        { method: 'PUT' }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intelligentDocsKeys.propagation() });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE SCORING HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useCalculateCompliance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      documentId: string;
      submissionType: 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO' | 'EUA';
    }) => {
      return fetchApi<ComplianceScore>('/compliance/calculate', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: intelligentDocsKeys.complianceHistory(variables.documentId),
      });
    },
  });
}

export function useComplianceHistory(documentId: string) {
  return useQuery({
    queryKey: intelligentDocsKeys.complianceHistory(documentId),
    queryFn: async () => {
      return fetchApi<{ history: ComplianceScore[] }>(`/compliance/history?documentId=${documentId}`);
    },
    enabled: !!documentId,
  });
}

export function useComplianceRules(filters?: { submissionType?: string; category?: string }) {
  return useQuery({
    queryKey: intelligentDocsKeys.complianceRules(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.submissionType) params.set('submissionType', filters.submissionType);
      if (filters?.category) params.set('category', filters.category);
      const query = params.toString() ? `?${params}` : '';
      return fetchApi<{ rules: ComplianceRule[] }>(`/compliance/rules${query}`);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined Hook for Document Editor Integration
// ─────────────────────────────────────────────────────────────────────────────

export function useDocumentCompliance(documentId: string, submissionType?: string) {
  const queryClient = useQueryClient();
  const historyQuery = useComplianceHistory(documentId);
  const calculateMutation = useCalculateCompliance();

  const latestScore = historyQuery.data?.history?.[0];

  const refresh = async () => {
    if (submissionType) {
      await calculateMutation.mutateAsync({
        documentId,
        submissionType: submissionType as ComplianceScore['submissionType'],
      });
    }
  };

  return {
    score: latestScore,
    history: historyQuery.data?.history || [],
    isLoading: historyQuery.isLoading || calculateMutation.isPending,
    refresh,
    error: historyQuery.error || calculateMutation.error,
  };
}

export function useDocumentTraceability(documentId: string) {
  const linksQuery = useTraceabilityLinks({ documentId });
  const createLinkMutation = useCreateTraceabilityLink();
  const verifyLinkMutation = useVerifyTraceabilityLink();

  return {
    links: linksQuery.data?.links || [],
    isLoading: linksQuery.isLoading,
    createLink: createLinkMutation.mutateAsync,
    verifyLink: verifyLinkMutation.mutateAsync,
    isCreating: createLinkMutation.isPending,
    isVerifying: verifyLinkMutation.isPending,
    error: linksQuery.error || createLinkMutation.error || verifyLinkMutation.error,
  };
}
