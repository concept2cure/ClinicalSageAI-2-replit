/**
 * Communication Center · Audit trail — the org-wide 21 CFR Part 11 chain of
 * handoffs (sign-offs, reviews, edits, access). Reuses the wired useAuditTrail
 * hook (GET /api/mdx/audit, org-scoped). Read-only and immutable by design —
 * every approval/rejection a reviewer makes elsewhere in the hub lands here.
 */

import * as React from 'react';
import { useAuditTrail } from '../../hooks/useProgramTabs';
import { Loading, ErrorState, Empty } from '../../tasking/surfaces/state';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';

export function CommAuditTimeline() {
  const audit = useAuditTrail();
  const events = audit.data?.events ?? [];

  if (audit.isLoading) return <Loading label="Loading audit trail…" />;
  if (audit.isError) return <ErrorState message="Could not load the audit trail. Try again." />;
  if (events.length === 0) return <Empty>No audit events recorded yet.</Empty>;

  return (
    <div className="panel">
      <div className="panel-hdr">
        <div>
          <div className="t">Audit trail</div>
          <div className="s">{events.length} event{events.length === 1 ? '' : 's'} · 21 CFR Part 11 · immutable</div>
        </div>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td style={{ color: 'var(--text-300)', whiteSpace: 'nowrap' }}>
                {/* GovernedTimestamp: UTC primary + local/tz — audit rows are
                    UTC on the server; the browser-locale render alone read as
                    clock drift when an inspector diffed this screen against
                    the audit table. */}
                <GovernedTimestamp value={e.when} layout="inline" />
              </td>
              <td>
                <div className="k-name">{e.actorName || e.actor}</div>
                {e.role && <div className="k-holder">{e.role}</div>}
              </td>
              <td><span className="status-pill review">{e.action}</span></td>
              <td style={{ color: 'var(--text-300)' }}>{e.target || e.resource}</td>
              <td style={{ color: 'var(--text-300)' }}>{e.reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
