/** Optional governed rejection hook, isolated from program-tab read imports. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkflowDecisionResult } from '../services/programTabsService';
import { rejectWorkflow } from '../services/workflowDecisionService';
import { programTabsQueryKeys } from './useProgramTabs';

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS — governed reject decisions
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkflowDecisionArgs {
  /** The approvalId from the pending row (numeric id at :id/reject). */
  approvalId: number | string;
  /** Reason-for-change captured at signing, stored verbatim as the comment. */
  comment: string;
}

/*
 * useApproveWorkflow (POST /api/approval-workflows/:id/approve) was removed on
 * 2026-10-08 with the route: it approved a step with a client-side password
 * check and no server-side ceremony, and had no caller after the Communication
 * Center's Approvals surface was deleted (2895218b8). An approval is a signed
 * act (services/part11/reverify-signer.ts).
 */

/**
 * Reject a pending step (POST /api/approval-workflows/:id/reject). The server
 * requires a non-empty rejection reason; the signing reason supplies it. On
 * success the pending queue is invalidated.
 */
export function useRejectWorkflow() {
  const queryClient = useQueryClient();
  return useMutation<WorkflowDecisionResult, Error, WorkflowDecisionArgs>({
    mutationFn: ({ approvalId, comment }) =>
      rejectWorkflow(approvalId, comment),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: programTabsQueryKeys.approvals() });
    },
  });
}
