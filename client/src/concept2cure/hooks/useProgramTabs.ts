/**
 * @fileoverview Program sub-tabs React hooks — Audit · Correspondence · Approvals
 * @module concept2cure/hooks/useProgramTabs
 * @version 1.0.0
 *
 * @description
 * React-query hooks backing the shared ProgramSubTabs strip. Mirrors useRisk /
 * useCMC: structured query keys, query hooks for reads, defensive scoping per
 * each route's actual contract. No mocks.
 *
 *   useAuditTrail({ program?, filters? })  — GET /api/mdx/audit (org + optional
 *                                            program/action/resource/actor/date)
 *   useCorrespondence(projectId)           — GET /api/regulatory-correspondence
 *                                            /correspondence?projectId= (per project)
 *   useApprovalsPending()                  — GET /api/approval-workflows/pending
 *                                            (current user + org, no project id)
 */

import { useQuery } from '@tanstack/react-query';
import programTabsService, {
  type AuditTrail,
  type AuditFilters,
  type CorrespondenceRow,
  type PendingApproval,
} from '../services/programTabsService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const programTabsQueryKeys = {
  all: ['programTabs'] as const,
  audit: (filters: AuditFilters) => [...programTabsQueryKeys.all, 'audit', filters] as const,
  correspondence: (projectId: string) =>
    [...programTabsQueryKeys.all, 'correspondence', projectId] as const,
  approvals: () => [...programTabsQueryKeys.all, 'approvals', 'pending'] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseAuditTrailArgs {
  /** Program anchor — the canonical project id. Threaded as the program filter. */
  program?: string | null;
  /** Additional audit filters (action / resource / actor / from / to / limit). */
  filters?: Omit<AuditFilters, 'program'>;
}

/** 21 CFR Part 11 audit chain. Org-scoped server-side; program anchors the rows. */
export function useAuditTrail({ program, filters }: UseAuditTrailArgs = {}) {
  const merged: AuditFilters = { ...filters, ...(program ? { program } : {}) };
  return useQuery<AuditTrail>({
    queryKey: programTabsQueryKeys.audit(merged),
    queryFn: () => programTabsService.getAuditTrail(merged),
    staleTime: 60 * 1000,
  });
}

/** Health-authority correspondence threads for a project. */
export function useCorrespondence(projectId: string | null) {
  return useQuery<CorrespondenceRow[]>({
    queryKey: programTabsQueryKeys.correspondence(projectId ?? ''),
    queryFn: () => (projectId ? programTabsService.getCorrespondence(projectId) : []),
    enabled: projectId != null && projectId.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

/** Pending approval workflows for the current user. No project scoping. */
export function useApprovalsPending() {
  return useQuery<PendingApproval[]>({
    queryKey: programTabsQueryKeys.approvals(),
    queryFn: () => programTabsService.getPendingApprovals(),
    staleTime: 60 * 1000,
  });
}
