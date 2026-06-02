/**
 * ApprovalsPane — pending e-sign workflow + signed history.
 * Ported 1:1 from `design-system/ui_kits/mdx/PathwayPanes.jsx` > ApprovalsPane.
 *
 * Differences from the kit (which was a static prototype):
 *  - data comes from useApprovals (real /api/approval-workflows/pending),
 *    not the K510/PMA/CER_APPROVALS demo rows;
 *  - "Apply signature" calls the real /approve endpoint via useSignApproval
 *    instead of flipping a local boolean;
 *  - the Signed history renders honest-empty (no completed-approvals source
 *    yet) rather than fabricating signed rows;
 *  - the just-signed confirmation drops the kit's random `WP-####` id — the
 *    work-product id / SHA-256 manifest is audit-trail enrichment behind the
 *    logged backend gap, not something to invent client-side.
 */

import * as React from 'react';
import { I } from '../../icons';
import type { Approval } from '../../types';
import { APPROVAL_STAGE_META } from '../../data/pathwayTabs';
import { useSignApproval } from '../../hooks/useSignApproval';

/* ── local date helpers (ported from PathwayPanes.jsx) ─────────────────── */

function fmtTime(iso: string | undefined, opts: { full?: boolean } = {}): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const ageH = (Date.now() - d.getTime()) / 3.6e6;
  if (opts.full || ageH > 24 * 14) {
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }
  if (ageH < 1) return `${Math.max(1, Math.round(ageH * 60))}m ago`;
  if (ageH < 24) return `${Math.round(ageH)}h ago`;
  return `${Math.round(ageH / 24)}d ago`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = iso.includes('T') ? new Date(iso) : new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

const stageLabel = (stage: Approval['stage']): string =>
  APPROVAL_STAGE_META[stage]?.label ?? stage;

/* ── section target shape passed up to open a section in the dossier ───── */

export interface ApprovalTarget {
  id: number | string;
  label: string;
}

export interface ApprovalsPaneProps {
  approvals: Approval[];
  loading?: boolean;
  error?: string | null;
  /** Re-fetch pending after a successful signature. */
  onRefresh?: () => void;
  onOpenSection?: (target: ApprovalTarget) => void;
  currentUser?: string;
}

export function ApprovalsPane({
  approvals,
  loading = false,
  error = null,
  onRefresh,
  onOpenSection,
  currentUser = 'You',
}: ApprovalsPaneProps) {
  const pending = approvals.filter((a) => a.status === 'pending');
  const signed = approvals.filter((a) => a.status === 'signed');

  return (
    <div className="ap-pane">
      <div className="ap-section">
        <div className="ap-sec-hdr">
          <div>
            <div className="ap-sec-title">Pending your signature</div>
            <div className="ap-sec-sub">
              {pending.filter((a) => a.signer === currentUser).length} require your e-sign ·{' '}
              {pending.length} total open
            </div>
          </div>
          <span className="ap-cfr">21 CFR Part 11 · §11.50 · §11.70</span>
        </div>

        {error && <div className="audit-empty">Could not load approvals — {error}</div>}
        {!error && loading && pending.length === 0 && (
          <div className="audit-empty">Loading approvals…</div>
        )}
        {!error && !loading && pending.length === 0 && (
          <div className="audit-empty">No pending approvals.</div>
        )}

        {pending.map((a) => (
          <ApprovalCard
            key={a.id}
            a={a}
            mine={a.signer === currentUser}
            onOpenSection={onOpenSection}
            onSigned={onRefresh}
          />
        ))}
      </div>

      <div className="ap-section">
        <div className="ap-sec-hdr">
          <div>
            <div className="ap-sec-title">Signed</div>
            <div className="ap-sec-sub">{signed.length} completed approvals · audit trail</div>
          </div>
        </div>
        <div className="ap-signed">
          {signed.length === 0 && (
            <div className="audit-empty">No signed approvals in this view yet.</div>
          )}
          {signed.map((a) => (
            <div key={a.id} className="ap-signed-row">
              <span className="ap-stage-pill" data-stage={a.stage}>{stageLabel(a.stage)}</span>
              <div className="ap-signed-target">
                <div className="ap-signed-name">{a.target}</div>
                <div className="ap-signed-meta">
                  {a.signer} · {a.role} · {fmtTime(a.signed_at, { full: true })}
                </div>
              </div>
              <span className="audit-signed" title="Signed · Part 11">{I.lock}</span>
              {a.target_id !== undefined && (
                <button
                  className="ap-link"
                  onClick={() => onOpenSection?.({ id: a.target_id!, label: a.target })}
                >
                  {I.arrowRight}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ApprovalCardProps {
  a: Approval;
  mine: boolean;
  onOpenSection?: (target: ApprovalTarget) => void;
  onSigned?: () => void;
}

function ApprovalCard({ a, mine, onOpenSection, onSigned }: ApprovalCardProps) {
  const [signingOpen, setSigningOpen] = React.useState(false);
  const [pwd, setPwd] = React.useState('');
  const [mfa, setMfa] = React.useState('');
  const [meaning, setMeaning] = React.useState(a.meaning || '');
  const [done, setDone] = React.useState(false);

  const { sign, signing, error } = useSignApproval(() => {
    setDone(true);
    onSigned?.();
  });

  const days = daysUntil(a.due);
  const overdue = days !== null && days < 0;

  const canApply =
    pwd.length >= 6 &&
    /^\d{6}$/.test(mfa) &&
    meaning.trim().length > 0 &&
    !signing;

  const apply = async () => {
    await sign({
      approvalId: a.id,
      meaning: meaning.trim(),
      password: pwd,
      mfaToken: mfa,
    });
  };

  if (done) {
    return (
      <div className="ap-card signed">
        <div className="ap-card-hdr">
          <span className="ap-stage-pill" data-stage={a.stage}>{stageLabel(a.stage)}</span>
          <span className="audit-signed">{I.lock} Signed just now</span>
        </div>
        <div className="ap-card-target">{a.target}</div>
        <div className="ap-card-meta">Acknowledged: "{meaning}"</div>
      </div>
    );
  }

  return (
    <div className={`ap-card ${mine ? 'mine' : ''}`}>
      <div className="ap-card-hdr">
        <span className="ap-stage-pill" data-stage={a.stage}>{stageLabel(a.stage)}</span>
        <span className="ap-card-due-spacer" />
        {a.due && (
          <span className={`ap-card-due ${overdue ? 'err' : days !== null && days <= 2 ? 'warn' : ''}`}>
            Due {fmtDate(a.due)}
            {days !== null && (overdue ? ` · ${-days}d late` : ` · ${days}d`)}
          </span>
        )}
      </div>

      <div className="ap-card-target">{a.target}</div>
      <div className="ap-card-meta">
        Requested by {a.requested_by} · {fmtTime(a.requested)} · Signer: <b>{a.signer}</b> ({a.role})
      </div>

      {mine && !signingOpen && (
        <div className="ap-card-actions">
          <button className="ap-sign-btn" onClick={() => setSigningOpen(true)}>{I.lock} E-sign</button>
          <button className="ap-decline-btn">Decline</button>
          {a.target_id !== undefined && (
            <button
              className="ap-review-btn"
              onClick={() => onOpenSection?.({ id: a.target_id!, label: a.target })}
            >
              {I.fileText} Review in dossier
            </button>
          )}
        </div>
      )}

      {!mine && (
        <div className="ap-card-actions">
          <button className="ap-review-btn">{I.bell} Remind {a.signer.split(' ')[0]}</button>
          {a.target_id !== undefined && (
            <button
              className="ap-review-btn"
              onClick={() => onOpenSection?.({ id: a.target_id!, label: a.target })}
            >
              {I.fileText} View
            </button>
          )}
        </div>
      )}

      {mine && signingOpen && (
        <div className="ap-sign-form">
          <div className="ap-sign-attest">
            <span className="ap-sign-attest-label">Meaning of signature</span>
            <input
              className="ap-sign-input"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              placeholder="e.g. Reviewed and approved"
            />
          </div>
          <div className="ap-sign-creds">
            <input
              className="ap-sign-input"
              type="password"
              placeholder="Re-enter password"
              autoComplete="current-password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
            <input
              className="ap-sign-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit auth code"
              value={mfa}
              onChange={(e) => setMfa(e.target.value.replace(/\D/g, ''))}
            />
            <button
              className="ap-sign-confirm"
              disabled={!canApply}
              onClick={apply}
            >
              {I.lock} {signing ? 'Signing…' : 'Apply signature'}
            </button>
            <button
              className="ap-sign-cancel"
              onClick={() => { setSigningOpen(false); setPwd(''); setMfa(''); }}
            >
              Cancel
            </button>
          </div>
          {error && <div className="ap-sign-error">{error}</div>}
          <div className="ap-sign-foot">
            21 CFR §11.100(b) · By signing with your password and authentication code, you certify
            the listed meaning. Time, IP, and a SHA-256 of this record will be appended to the
            audit trail.
          </div>
        </div>
      )}
    </div>
  );
}
