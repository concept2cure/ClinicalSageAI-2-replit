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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import programTabsService, {
  type AuditTrail,
  type AuditFilters,
  type CorrespondenceRow,
  type CorrespondenceDetail,
  type CorrespondenceIssue,
  type PendingApproval,
  type WorkflowDecisionResult,
} from '../services/programTabsService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const programTabsQueryKeys = {
  all: ['programTabs'] as const,
  audit: (filters: AuditFilters) => [...programTabsQueryKeys.all, 'audit', filters] as const,
  correspondence: (projectId: string) =>
    [...programTabsQueryKeys.all, 'correspondence', projectId] as const,
  correspondenceDetail: (correspondenceId: string) =>
    [...programTabsQueryKeys.all, 'correspondence', 'detail', correspondenceId] as const,
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

/**
 * One correspondence thread with its parsed issues. Only loads when expanded
 * (correspondenceId non-null), so the list view stays one round-trip.
 */
export function useCorrespondenceDetail(correspondenceId: string | null) {
  return useQuery<CorrespondenceDetail>({
    queryKey: programTabsQueryKeys.correspondenceDetail(correspondenceId ?? ''),
    queryFn: () =>
      correspondenceId
        ? programTabsService.getCorrespondenceDetail(correspondenceId)
        : { data: null, issues: [], responsePackages: [] },
    enabled: correspondenceId != null && correspondenceId.length > 0,
    staleTime: 60 * 1000,
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

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS — governed approve / reject decisions
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkflowDecisionArgs {
  /** The approvalId from the pending row (numeric id at :id/approve|reject). */
  approvalId: number | string;
  /** Reason-for-change captured at signing, stored verbatim as the comment. */
  comment: string;
}

/**
 * Approve a pending step (POST /api/approval-workflows/:id/approve). On success
 * the pending queue is invalidated so the resolved item leaves the list. Mirrors
 * the read hooks' service idiom; the e-signature gate is applied by the caller
 * through the shared EsignModal before this runs.
 */
export function useApproveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation<WorkflowDecisionResult, Error, WorkflowDecisionArgs>({
    mutationFn: ({ approvalId, comment }) =>
      programTabsService.approveWorkflow(approvalId, comment),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: programTabsQueryKeys.approvals() });
    },
  });
}

/**
 * Reject a pending step (POST /api/approval-workflows/:id/reject). The server
 * requires a non-empty rejection reason; the signing reason supplies it. On
 * success the pending queue is invalidated.
 */
export function useRejectWorkflow() {
  const queryClient = useQueryClient();
  return useMutation<WorkflowDecisionResult, Error, WorkflowDecisionArgs>({
    mutationFn: ({ approvalId, comment }) =>
      programTabsService.rejectWorkflow(approvalId, comment),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: programTabsQueryKeys.approvals() });
    },
  });
}

export interface ReviewIssueArgs {
  /** The issue id from the correspondence detail (PATCH /issues/:issueId/review). */
  issueId: string;
  /** Parent correspondence id — invalidated on success so the detail refreshes. */
  correspondenceId: string;
  /**
   * Reason-for-change captured in the confirm dialog. The review is a governed
   * `resolve` action, so the reason is REQUIRED (min 8 chars) and is written
   * verbatim into the audit_logs + c2c_ana_actions ledger by the server.
   */
  reason: string;
}

/**
 * Mark one parsed correspondence issue reviewed. The review route is a governed
 * `resolve` action: it requires a reason and writes the mutation-primitives
 * ledger. On success the parent correspondence detail and the project
 * correspondence list are invalidated.
 */
export function useReviewIssue() {
  const queryClient = useQueryClient();
  return useMutation<CorrespondenceIssue, Error, ReviewIssueArgs>({
    mutationFn: ({ issueId, reason }) =>
      programTabsService.reviewIssue(issueId, { humanReviewStatus: 'confirmed', reason }),
    onSuccess: (_issue, { correspondenceId }) => {
      void queryClient.invalidateQueries({
        queryKey: programTabsQueryKeys.correspondenceDetail(correspondenceId),
      });
      void queryClient.invalidateQueries({
        queryKey: [...programTabsQueryKeys.all, 'correspondence'],
      });
    },
  });
}
