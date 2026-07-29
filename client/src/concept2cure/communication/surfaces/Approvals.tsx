/**
 * Communication Center · Approvals — pending e-sign sign-offs across every
 * program, for the current user. Reuses the wired program-tab hooks
 * (useApprovalsPending / useApproveWorkflow / useRejectWorkflow against
 * /api/approval-workflows/*) and the shared 21 CFR Part 11 EsignModal. The
 * signing reason is stored verbatim as the workflow comment / audit entry.
 *
 * This is the same approve/reject flow ProgramSubTabs ships per-program, lifted
 * to the org-wide handoff hub so a reviewer sees one queue, not N.
 */

import * as React from 'react';
import {
  useApprovalsPending,
  useApproveWorkflow,
  useRejectWorkflow,
} from '../../hooks/useProgramTabs';
import type { PendingApproval } from '../../services/programTabsService';
import { EsignModal } from '../../_shared/components';
import type { EsigMeaning } from '../../hooks/useEsignature';
import type { EsigSignedManifest } from '../../_shared/components/EsignModal';
import { Loading, ErrorState, Empty } from '../../tasking/surfaces/state';

type Decision = 'approve' | 'reject';

interface SigningTarget {
  approvalId: number | string;
  label: string;
  decision: Decision;
}

function formatDue(raw: unknown): string | null {
  if (!raw) return null;
  const d = new Date(raw as string);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

/** The client PendingApproval is loosely typed ([key]: unknown), so read string
 *  fields defensively — same posture as ProgramSubTabs' field picker. */
function str(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v : '';
}

export function CommApprovals({ onAskAna }: { onAskAna: (t: string) => void }) {
  const appr = useApprovalsPending();
  const approve = useApproveWorkflow();
  const reject = useRejectWorkflow();
  const rows: PendingApproval[] = appr.data ?? [];

  const [signing, setSigning] = React.useState<SigningTarget | null>(null);

  const onSign = React.useCallback(
    async ({ reason, meaning }: { reason: string; meaning: EsigMeaning }): Promise<EsigSignedManifest> => {
      if (!signing) throw new Error('No approval selected.');
      if (signing.decision === 'approve') {
        await approve.mutateAsync({ approvalId: signing.approvalId as number, comment: reason });
      } else {
        await reject.mutateAsync({ approvalId: signing.approvalId as number, comment: reason });
      }
      return { meaning, reason, signedAt: new Date().toISOString() };
    },
    [signing, approve, reject],
  );

  if (appr.isLoading) return <Loading label="Loading approvals…" />;
  if (appr.isError) return <ErrorState message="Could not load pending approvals. Try again." />;
  if (rows.length === 0) return <Empty>You have no approvals awaiting sign-off.</Empty>;

  return (
    <div className="panel">
      <div className="panel-hdr">
        <div>
          <div className="t">Pending approvals</div>
          <div className="s">{rows.length} awaiting your e-signature · across all programs</div>
        </div>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Document</th>
            <th>Step</th>
            <th>Requested by</th>
            <th>Due</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => {
            const approvalIdRaw = (w.approvalId ?? w.id) as number | string | undefined;
            const approvalId =
              typeof approvalIdRaw === 'number' || typeof approvalIdRaw === 'string' ? approvalIdRaw : undefined;
            const label = str(w.documentTitle) || `Approval ${String(approvalId ?? i)}`;
            const due = formatDue(w.dueDate);
            return (
              <tr key={String(approvalId ?? i)}>
                <td><div className="k-name">{label}</div></td>
                <td style={{ color: 'var(--text-300)' }}>{str(w.stepName) || 'Awaiting review'}</td>
                <td style={{ color: 'var(--text-300)' }}>{str(w.requestedByName) || '—'}</td>
                <td>
                  {due ? (
                    <span className="status-pill review">Due {due}</span>
                  ) : (
                    <span className="status-pill na">No due date</span>
                  )}
                </td>
                <td>
                  {approvalId != null && (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        type="button"
                        className="tb-btn"
                        aria-label={`Approve ${label}`}
                        onClick={() => setSigning({ approvalId, label, decision: 'approve' })}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="tb-btn"
                        aria-label={`Reject ${label}`}
                        onClick={() => setSigning({ approvalId, label, decision: 'reject' })}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="tb-btn"
                        title="Ask AnA about this approval"
                        aria-label={`Ask AnA about ${label}`}
                        onClick={() => onAskAna(`Explain what I'm approving in "${label}" (step: ${str(w.stepName) || 'review'}) before I sign. What changed and what are the risks?`)}
                      >
                        Ask AnA
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <EsignModal
        open={!!signing}
        action={signing?.decision === 'reject' ? 'Reject approval' : 'Approve step'}
        target={signing?.label ?? ''}
        targetMeta={
          signing?.decision === 'reject'
            ? 'Signs the rejection per 21 CFR Part 11. The reason is required and stored verbatim.'
            : 'Signs the approval per 21 CFR Part 11. The reason is stored verbatim in the audit trail.'
        }
        defaultMeaning={signing?.decision === 'reject' ? 'review' : 'approval'}
        onClose={() => setSigning(null)}
        onSign={onSign}
      />
    </div>
  );
}
