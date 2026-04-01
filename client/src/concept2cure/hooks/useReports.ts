import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { getOrgId } from '@/utils/authToken';
import { queryKeys } from './queryKeys';

export type ReportRunStatus = 'queued' | 'partial' | 'completed' | 'failed';
export type DeliveryChannel = 'platform_send' | 'external_pdf_export';

export interface ReportRun {
  id: number;
  runUuid: string;
  reportTypeId: string;
  reportTypeLabel: string;
  scopeType: string;
  scopeId: string;
  status: ReportRunStatus;
  confidence: number | null;
  blockers: string[];
  createdAt: string;
  completedAt?: string | null;
}

export interface ReportBundle {
  bundleId: string;
  organizationId: number;
  name: string;
  description?: string;
  createdAt: string;
  runIds: number[];
  items: Array<{
    runId: number;
    reportTypeLabel: string;
    scopeType: string;
    scopeId: string;
    status: string;
    confidence: number | null;
  }>;
}

export interface ReportDelivery {
  deliveryId: string;
  channel: DeliveryChannel;
  status: 'sent' | 'exported' | 'queued' | 'failed';
  subject: string;
  recipients: string[];
  createdAt: string;
  runId?: number;
  bundleId?: string;
  correspondenceId?: string;
}

interface ListRunsParams {
  scopeType?: string;
  scopeId?: string;
  status?: string;
  reportTypeId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'completedAt' | 'confidence' | 'status' | 'reportType' | 'scopeType';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

interface GenerateParams {
  reportTypeId: string;
  scopeType: 'project' | 'program' | 'submission' | 'document' | 'account' | 'study';
  scopeId: string;
  clientWorkspaceId?: number;
  requestedBy?: number;
}

interface CreateBundleParams {
  name: string;
  description?: string;
  runIds: number[];
  createdBy?: number;
}

interface CreateDeliveryParams {
  runId?: number;
  bundleId?: string;
  submissionId?: string;
  projectId?: number;
  correspondenceType?: string;
  subject: string;
  message?: string;
  recipients: string[];
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  channel: DeliveryChannel;
  requestedBy?: number;
  captureForLearning?: boolean;
}

interface CaptureCorrespondenceParams {
  projectId: number;
  submissionId?: string;
  direction?: 'inbound' | 'outbound' | 'internal';
  sourceChannel?: 'manual_upload' | 'mailbox_sync' | 'api_import';
  communicationType?: string;
  subject: string;
  body: string;
  recipients?: string[];
  sender?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  responseRequired?: boolean;
  captureForLearning?: boolean;
}

export function useReports() {
  const queryClient = useQueryClient();
  const organizationId = Number(getOrgId() || '1');

  const taxonomyQuery = useQuery({
    queryKey: queryKeys.reports.catalog(),
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/report-os/taxonomy');
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 5 * 60_000,
  });

  const listRuns = async (params: ListRunsParams = {}): Promise<ReportRun[]> => {
    const query = new URLSearchParams({
      organizationId: String(organizationId),
      ...(params.scopeType ? { scopeType: params.scopeType } : {}),
      ...(params.scopeId ? { scopeId: params.scopeId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.reportTypeId ? { reportTypeId: params.reportTypeId } : {}),
      ...(params.search ? { search: params.search } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
      ...(params.limit ? { limit: String(params.limit) } : {}),
    });
    const res = await apiRequest('GET', `/api/report-os/runs?${query.toString()}`);
    const json = await res.json();
    return json.data || [];
  };

  const runsQuery = useQuery({
    queryKey: queryKeys.reports.list(),
    queryFn: () => listRuns({ sortBy: 'createdAt', sortOrder: 'desc', limit: 200 }),
    staleTime: 30_000,
  });

  const bundlesQuery = useQuery({
    queryKey: ['concept2cure', 'reports', 'bundles', organizationId] as const,
    queryFn: async (): Promise<ReportBundle[]> => {
      const res = await apiRequest('GET', `/api/report-os/bundles?organizationId=${organizationId}`);
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 30_000,
  });

  const deliveriesQuery = useQuery({
    queryKey: ['concept2cure', 'reports', 'deliveries', organizationId] as const,
    queryFn: async (): Promise<ReportDelivery[]> => {
      const res = await apiRequest('GET', `/api/report-os/deliveries?organizationId=${organizationId}`);
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 30_000,
  });

  const generateMutation = useMutation({
    mutationFn: async (params: GenerateParams) => {
      const res = await apiRequest('POST', '/api/report-os/runs', {
        organizationId,
        ...params,
      });
      const json = await res.json();
      return json.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reports.list() }),
        queryClient.invalidateQueries({ queryKey: ['concept2cure', 'reports', 'deliveries', organizationId] }),
      ]);
    },
  });

  const createBundleMutation = useMutation({
    mutationFn: async (params: CreateBundleParams) => {
      const res = await apiRequest('POST', '/api/report-os/bundles', {
        organizationId,
        ...params,
      });
      const json = await res.json();
      return json.data as ReportBundle;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['concept2cure', 'reports', 'bundles', organizationId],
      });
    },
  });

  const createDeliveryMutation = useMutation({
    mutationFn: async (params: CreateDeliveryParams) => {
      const res = await apiRequest('POST', '/api/report-os/deliveries', {
        organizationId,
        captureForLearning: true,
        ...params,
      });
      const json = await res.json();
      return json.data as ReportDelivery;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['concept2cure', 'reports', 'deliveries', organizationId],
      });
    },
  });

  const captureCorrespondenceMutation = useMutation({
    mutationFn: async (params: CaptureCorrespondenceParams) => {
      const res = await apiRequest('POST', '/api/report-os/correspondence/capture', {
        organizationId,
        captureForLearning: true,
        ...params,
      });
      const json = await res.json();
      return json.data as {
        correspondenceId?: string;
        persistedToPlatform: boolean;
        issues: Array<{ category: string; severity: string; blocker: boolean }>;
      };
    },
  });

  const runPdfExportUrl = (runId: number) =>
    `/api/report-os/runs/${runId}/export.pdf?organizationId=${organizationId}`;
  const bundlePdfExportUrl = (bundleId: string) =>
    `/api/report-os/bundles/${bundleId}/export.pdf?organizationId=${organizationId}`;

  return {
    organizationId,
    taxonomy: taxonomyQuery.data || [],
    runs: (runsQuery.data || []) as ReportRun[],
    bundles: bundlesQuery.data || [],
    deliveries: deliveriesQuery.data || [],
    listRuns,
    runPdfExportUrl,
    bundlePdfExportUrl,
    generateReport: generateMutation.mutateAsync,
    createBundle: createBundleMutation.mutateAsync,
    createDelivery: createDeliveryMutation.mutateAsync,
    captureCorrespondence: captureCorrespondenceMutation.mutateAsync,
    isLoading:
      runsQuery.isLoading || taxonomyQuery.isLoading || bundlesQuery.isLoading || deliveriesQuery.isLoading,
    isGenerating: generateMutation.isPending,
    isCreatingBundle: createBundleMutation.isPending,
    isCreatingDelivery: createDeliveryMutation.isPending,
    isCapturingCorrespondence: captureCorrespondenceMutation.isPending,
    refreshAll: async () => {
      await Promise.all([
        runsQuery.refetch(),
        taxonomyQuery.refetch(),
        bundlesQuery.refetch(),
        deliveriesQuery.refetch(),
      ]);
    },
  };
}
