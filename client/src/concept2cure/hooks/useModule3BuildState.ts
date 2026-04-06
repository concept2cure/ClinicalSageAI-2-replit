/**
 * useModule3BuildState — Fetch unified Module 3 build state for all 15 subsections.
 *
 * This hook provides the dossier tree and editor with real build readiness
 * instead of just artifact-placement status. It queries the Module 3 OS
 * build-state endpoint which combines source objects, compiled sections,
 * contradictions, and governed artifacts into one unified view.
 *
 * Phase 3 — Module 3 Workflow Convergence
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from './queryKeys';

// ── Types ────────────────────────────────────────────────────────────────────

export type Module3BuildState =
  | 'no_sources'
  | 'sources_uploaded'
  | 'extraction_pending'
  | 'extraction_complete'
  | 'compiled'
  | 'draft_artifact_created'
  | 'stale'
  | 'contradiction_flagged'
  | 'review'
  | 'approved'
  | 'locked';

export interface Module3SectionBuildStatus {
  sectionKey: string;
  sectionLabel: string;
  buildState: Module3BuildState;
  sourceObjectCount: number;
  uploadedSourceCount: number;
  sourceTypes: string[];
  completeness: number;
  missingInputs: string[];
  hasContradictions: boolean;
  contradictionCount: number;
  isStale: boolean;
  staleReason: string | null;
  approvalState: string;
  hasNarrative: boolean;
  artifactId: string | null;
  artifactStatus: string | null;
  lastCompiled: string | null;
  lastUpdated: string | null;
}

export interface Module3BuildSummary {
  totalSections: number;
  readySections: number;
  staleSections: number;
  blockedSections: number;
  buildableSections: number;
  readinessPercent: number;
}

export interface Module3BuildStateResponse {
  sections: Module3SectionBuildStatus[];
  summary: Module3BuildSummary;
}

// ── Build state display config ───────────────────────────────────────────────

export const BUILD_STATE_CONFIG: Record<
  Module3BuildState,
  { label: string; color: string; bgColor: string; priority: number }
> = {
  no_sources: { label: 'No Sources', color: 'text-stone-400', bgColor: 'bg-stone-50', priority: 0 },
  sources_uploaded: { label: 'Sources Uploaded', color: 'text-amber-600', bgColor: 'bg-amber-50', priority: 1 },
  extraction_pending: { label: 'Extraction Pending', color: 'text-amber-700', bgColor: 'bg-amber-50', priority: 2 },
  extraction_complete: { label: 'Extracted', color: 'text-stone-600', bgColor: 'bg-stone-100', priority: 3 },
  compiled: { label: 'Compiled', color: 'text-stone-700', bgColor: 'bg-stone-100', priority: 4 },
  draft_artifact_created: { label: 'Draft Ready', color: 'text-stone-800', bgColor: 'bg-stone-100', priority: 5 },
  stale: { label: 'Stale', color: 'text-amber-700', bgColor: 'bg-amber-50', priority: 6 },
  contradiction_flagged: { label: 'Contradiction', color: 'text-red-700', bgColor: 'bg-red-50', priority: 7 },
  review: { label: 'In Review', color: 'text-stone-700', bgColor: 'bg-stone-50', priority: 8 },
  approved: { label: 'Approved', color: 'text-emerald-700', bgColor: 'bg-emerald-50', priority: 9 },
  locked: { label: 'Locked', color: 'text-stone-900', bgColor: 'bg-stone-200', priority: 10 },
};

// ── Hook ────────────────────────────────────────────────────────────────────

export function useModule3BuildState(projectId: string | undefined, cmcProjectId: string | undefined) {
  return useQuery<Module3BuildStateResponse>({
    queryKey: queryKeys.module3.buildState(projectId, cmcProjectId),
    queryFn: async () => {
      const id = cmcProjectId || projectId;
      if (!id) throw new Error('Project ID required');
      const res = await apiRequest('GET', `/api/cmc/module3-os/build-state/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch build state');
      return json.data as Module3BuildStateResponse;
    },
    enabled: !!(cmcProjectId || projectId),
    staleTime: 30 * 1000, // 30s cache
    refetchOnWindowFocus: true,
  });
}

// ── Helper: get build state for a specific section ──────────────��───────────

export function getSectionBuildState(
  buildState: Module3BuildStateResponse | undefined,
  sectionKey: string
): Module3SectionBuildStatus | null {
  if (!buildState) return null;
  return buildState.sections.find((s) => s.sectionKey === sectionKey) || null;
}

// ── Helper: check if a section is actionable (can be built/refreshed) ───────

export function isSectionBuildable(status: Module3SectionBuildStatus): boolean {
  return (
    status.sourceObjectCount > 0 &&
    status.buildState !== 'approved' &&
    status.buildState !== 'locked'
  );
}

export function isSectionRefreshable(status: Module3SectionBuildStatus): boolean {
  return status.isStale && status.sourceObjectCount > 0;
}
