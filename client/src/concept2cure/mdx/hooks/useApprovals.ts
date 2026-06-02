/**
 * useApprovals — fetches GET /api/approval-workflows/pending and adapts each
 * server PendingApproval row into the kit's Approval shape (../types).
 *
 * The endpoint is already scoped to the current user server-side
 * (assignedTo includes the caller, or the '*' wildcard), so every row it
 * returns is the signer's own — the adapter sets `signer: 'You'` and routes
 * the row into ApprovalsPane's "pending your signature" section.
 *
 * It returns only pending rows; there is no completed-approvals source yet,
 * so ApprovalsPane's Signed history renders honest-empty (a read gap, not a
 * fabricated list).
 */

import { useMemo } from 'react';
import type { Approval, ApprovalStage } from '../types';
import { useFetchJson } from './useFetchJson';

/** Row shape from ApprovalOrchestrator.getPendingApprovals (PendingApproval). */
interface ServerPendingApproval {
  approvalId: number;
  workflowId: number;
  documentId: number;
  documentTitle: string;
  stepName: string;
  stepDescription: string;
  stepOrder: number;
  assignedTo: string[];
  requiredActions: string[];
  workflowStartedAt: string;
  requestedByUserId: string;
  requestedByName: string;
  dueDate: string | null;
}

interface PendingPayload {
  success: boolean;
  approvals: ServerPendingApproval[];
  total: number;
}

/** Map a free-text workflow step name onto the closed stage enum. */
function deriveStage(stepName: string): ApprovalStage {
  const s = (stepName || '').toLowerCase();
  if (s.includes('regulat')) return 'regulatory';
  if (s.includes('medical') || s.includes('clinical') || s.includes('med affairs')) return 'medical';
  if (s.includes('qa') || s.includes('quality')) return 'qa';
  return 'review';
}

const STAGE_ROLE: Record<ApprovalStage, string> = {
  review: 'Reviewer',
  qa: 'QA',
  medical: 'Med Affairs',
  regulatory: 'Reg Lead',
};

function toIso(v: string): string {
  if (!v) return v;
  if (v.includes('T')) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

export interface UseApprovalsResult {
  approvals: Approval[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useApprovals(): UseApprovalsResult {
  const { data, loading, error, refresh } = useFetchJson<PendingPayload>(
    '/api/approval-workflows/pending',
  );

  const approvals = useMemo<Approval[]>(() => {
    const rows = data?.approvals ?? [];
    return rows.map((r): Approval => {
      const stage = deriveStage(r.stepName);
      return {
        id: String(r.approvalId),
        stage,
        target: r.documentTitle || `Step ${r.stepOrder}`,
        target_id: r.documentId,
        target_kind: 'Section',
        requested: toIso(r.workflowStartedAt),
        requested_by: r.requestedByName || 'Unknown',
        // /pending is user-scoped, so every returned row is the caller's.
        signer: 'You',
        role: STAGE_ROLE[stage],
        due: r.dueDate ?? undefined,
        status: 'pending',
        meaning: r.stepDescription || r.stepName || '',
      };
    });
  }, [data]);

  return { approvals, loading, error, refresh };
}
