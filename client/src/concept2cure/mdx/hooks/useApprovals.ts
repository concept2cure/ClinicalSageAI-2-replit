/**
 * useApprovals — pending approvals for the current user, adapted to the
 * kit's `Approval` shape so the pathway approvals pane reads real workflow
 * data.
 *
 * Endpoint: `GET /api/approval-workflows/pending`
 * (server/routes/approval-workflow.ts → ApprovalOrchestrator.getPendingApprovals).
 *
 * The orchestrator's PendingApproval now exposes `requestedByName`,
 * `dueDate`, and `stepDescription` (joined on users / lifted from
 * workflows.metadata.due / pulled from workflow_steps.description), so
 * every kit field maps to a real value when the data is in place.
 *
 * Filtering: the endpoint scopes to the authenticated user's pending
 * queue across all active workflows in the org; there is no per-program
 * filter today. Pass `programIdent` to filter client-side by document
 * title (rough proxy until the orchestrator gets a `programId` join).
 */

import { useCallback, useEffect, useState } from 'react';
import type { Approval, ApprovalStage, ApprovalStatus } from '../types';

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

const STAGE_BY_KEYWORD: { match: RegExp; stage: ApprovalStage }[] = [
  { match: /reg(ulatory)?|ra |compliance/i, stage: 'regulatory' },
  { match: /med(ical)?|clinical/i,           stage: 'medical' },
  { match: /qa|quality/i,                    stage: 'qa' },
  { match: /review|peer/i,                   stage: 'review' },
];

function deriveStage(stepName: string): ApprovalStage {
  for (const { match, stage } of STAGE_BY_KEYWORD) {
    if (match.test(stepName)) return stage;
  }
  return 'review';
}

function rowToKit(row: ServerPendingApproval): Approval {
  return {
    id:           `AP-${row.approvalId}`,
    stage:        deriveStage(row.stepName),
    target:       row.documentTitle,
    target_id:    row.documentId,
    target_kind:  'Section',
    requested:    row.workflowStartedAt,
    requested_by: row.requestedByName || row.requestedByUserId || '—',
    signer:       row.assignedTo[0] === '*' ? 'You' : row.assignedTo[0] ?? 'You',
    role:         row.stepName,
    status:       'pending' as ApprovalStatus,
    due:          row.dueDate ?? undefined,
    meaning:      row.stepDescription || row.requiredActions.join(', ') || row.stepName,
  };
}

export interface UseApprovalsOptions {
  /** Filter to approvals whose target documentTitle includes this string.
   *  Applied client-side; pass the program code (e.g. "BX-204"). */
  programIdent?: string;
  /** Filter to a specific approval stage. */
  stage?: ApprovalStage;
}

export interface UseApprovalsResult {
  approvals: Approval[] | null;
  total: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useApprovals(opts: UseApprovalsOptions = {}): UseApprovalsResult {
  const [state, setState] = useState<{
    approvals: Approval[] | null;
    total: number | null;
    loading: boolean;
    error: string | null;
  }>({ approvals: null, total: null, loading: false, error: null });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const { programIdent, stage } = opts;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    fetch('/api/approval-workflows/pending', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as PendingPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        let approvals = payload.approvals.map(rowToKit);
        if (programIdent) {
          approvals = approvals.filter((a) => a.target.includes(programIdent));
        }
        if (stage) {
          approvals = approvals.filter((a) => a.stage === stage);
        }
        setState({ approvals, total: approvals.length, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load approvals',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [programIdent, stage, tick]);

  return { ...state, refresh };
}

/* Mutation helpers — keep panes a thin layer over these.
   All return the parsed JSON response so callers can read `success` /
   `workflowCompleted` / next-step info from ApprovalOrchestrator. */

export async function approveApproval(approvalId: number, comments?: string): Promise<unknown> {
  const res = await fetch(`/api/approval-workflows/${approvalId}/approve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments: comments ?? '' }),
  });
  if (!res.ok) {
    throw new Error(`Approve failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function rejectApproval(approvalId: number, comments: string): Promise<unknown> {
  if (!comments || !comments.trim()) {
    throw new Error('Rejection reason is required');
  }
  const res = await fetch(`/api/approval-workflows/${approvalId}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments }),
  });
  if (!res.ok) {
    throw new Error(`Reject failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function delegateApproval(
  approvalId: number,
  delegateTo: string,
  reason?: string,
): Promise<unknown> {
  const res = await fetch(`/api/approval-workflows/${approvalId}/delegate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delegateTo, reason }),
  });
  if (!res.ok) {
    throw new Error(`Delegate failed: HTTP ${res.status}`);
  }
  return res.json();
}
