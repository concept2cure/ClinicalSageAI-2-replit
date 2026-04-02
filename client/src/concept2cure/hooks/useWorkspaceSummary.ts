/**
 * @fileoverview useWorkspaceSummary — real-time workspace state
 * @module concept2cure/hooks/useWorkspaceSummary
 *
 * Fetches GET /api/workspace/summary and provides:
 * - org details
 * - real project/document/thread counts
 * - recent activity
 * - nextActions for the chat welcome screen
 *
 * Also hydrates localStorage keys for components that read them directly:
 *   currentOrganizationId, currentClientId, currentProjectId
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useVisibleInterval } from './useVisibleInterval';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkspaceSummaryOrg {
  id: string;
  name: string;
  slug: string;
  industryMode?: string;
}

export interface WorkspaceSummaryClient {
  id: string;
  name: string;
  projectCount: number;
}

export interface WorkspaceSummaryActive {
  clientId: string | null;
  projectId: string | null;
  projectName: string | null;
  mode: string;
}

export interface WorkspaceSummaryCounts {
  projects: number;
  documents: number;
  pendingReviews: number;
  complianceScore: number;
  threads: number;
}

export interface WorkspaceSummaryNextAction {
  id: string;
  label: string;
  intent: string;
  description?: string;
}

export interface WorkspaceSummary {
  org: WorkspaceSummaryOrg;
  clients: WorkspaceSummaryClient[];
  active: WorkspaceSummaryActive;
  counts: WorkspaceSummaryCounts;
  recent: {
    threads: Array<{ id: string; title: string; updatedAt: string; projectId: string | null }>;
    documents: Array<{ id: string; name: string; uploadedAt: string }>;
    exports: Array<{ id: string; type: string; createdAt: string }>;
    validations: Array<unknown>;
  };
  nextActions: WorkspaceSummaryNextAction[];
}

function getOrgId(): string {
  return localStorage.getItem('currentOrganizationId') || '1';
}

// ─── Fetch function ───────────────────────────────────────────────────────────

async function fetchWorkspaceSummary(): Promise<WorkspaceSummary> {
  const orgId = getOrgId();
  const res = await apiRequest('GET', `/api/workspace/summary?orgId=${orgId}`);

  if (!res.ok) throw new Error(`workspace/summary: ${res.status}`);
  const body = await res.json();
  const data: WorkspaceSummary = body.data ?? body;

  // Hydrate localStorage so legacy modules pick up the right IDs immediately
  if (data.active.clientId) {
    localStorage.setItem('currentClientId', data.active.clientId);
  }
  if (data.active.projectId) {
    localStorage.setItem('currentProjectId', data.active.projectId);
  }
  if (data.org?.id) {
    localStorage.setItem('currentOrganizationId', data.org.id);
    localStorage.setItem('currentOrganization', data.org.id);
  }
  if (data.org?.name) {
    localStorage.setItem('currentOrganizationName', data.org.name);
  }

  return data;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceSummary() {
  const interval = useVisibleInterval(60_000);
  return useQuery<WorkspaceSummary, Error>({
    queryKey: ['workspace-summary', getOrgId()],
    queryFn: fetchWorkspaceSummary,
    staleTime: 30_000, // refetch after 30s
    refetchInterval: interval, // pauses when tab is hidden
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

export default useWorkspaceSummary;
