/**
 * EstarFilingPanel — makes the eSTAR filing journey visible: the org's
 * registration prerequisites (head of the journey) and its tracked submissions
 * with the FDA review clock (tail). Self-contained + org-scoped (session cookie);
 * consumes the live backend via useEstarFiling. Rendered inside the PMA surface.
 *
 * Read-only + degrades gracefully (loading / empty / not-registered) — it never
 * blocks the surface. Uses the kit's established section/health/pma-mod classes
 * for visual consistency.
 */

import * as React from 'react';
import {
  useEstarRegistration,
  useEstarSubmissions,
  prerequisiteRows,
  type EstarSubmissionView,
} from '../hooks/useEstarFiling';

/** Human-readable lifecycle label. */
function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Kit status-pill tone per lifecycle status (falls back to the raw status). */
function statusTone(status: string): string {
  if (status === 'decision') return 'ok';
  if (status === 'withdrawn') return 'warn';
  if (status === 'additional_info') return 'warn';
  return status;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

function SubmissionCard({ s }: { s: EstarSubmissionView }) {
  const due = formatDate(s.decisionDueAt);
  return (
    <div className="pma-mod">
      <div className="pma-mod-hdr">
        <div className="pma-mod-label">{s.title ?? s.catalogKey}</div>
        <span className={`status-pill ${statusTone(s.status)}`}>{formatStatus(s.status)}</span>
      </div>
      <div className="pma-mod-desc">
        {s.programType.toUpperCase()} · {s.variant}
        {s.fdaTrackingNumber ? ` · ${s.fdaTrackingNumber}` : ''}
      </div>
      <div className="pma-mod-foot">
        <span>{due ? `Decision due ${due}` : 'No review clock'}</span>
        {s.reviewGoalDays ? <span>{s.reviewGoalDays}-day goal</span> : null}
      </div>
    </div>
  );
}

export function EstarFilingPanel() {
  const { registration, loading: regLoading } = useEstarRegistration();
  const { submissions, loading: subLoading } = useEstarSubmissions();

  const rows = prerequisiteRows(registration?.clientRegistration?.satisfied);
  const registered = !!registration?.registered;
  const satisfiedCount = rows.filter((r) => r.satisfied).length;

  const regSub = regLoading
    ? 'Loading registration…'
    : registered
      ? `Registered · ${satisfiedCount}/4 FDA prerequisites held`
      : 'Not yet registered for eSTAR';

  const subSub = subLoading
    ? 'Loading…'
    : submissions && submissions.length > 0
      ? `${submissions.length} filing${submissions.length === 1 ? '' : 's'} tracked`
      : 'No tracked filings yet';

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">eSTAR filing readiness</div>
          <div className="section-sub">{regSub}</div>
        </div>
      </div>

      <div className="health">
        {rows.map((r) => (
          <div key={r.id} className="health-card">
            <div className="health-label">{r.label}</div>
            <div className={`health-meta ${r.satisfied ? 'ok' : 'warn'}`}>
              <span className={`status-pill ${r.satisfied ? 'ok' : 'warn'}`}>
                {r.satisfied ? 'Held' : 'Missing'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-hdr">
        <div>
          <div className="section-title">Tracked submissions</div>
          <div className="section-sub">{subSub}</div>
        </div>
      </div>
      {submissions && submissions.length > 0 && (
        <div className="pma-modules">
          {submissions.map((s) => (
            <SubmissionCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </>
  );
}
