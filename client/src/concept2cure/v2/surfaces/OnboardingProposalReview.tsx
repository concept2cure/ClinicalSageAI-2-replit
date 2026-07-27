/**
 * OnboardingProposalReview — the human review + approval gate for AnA's
 * onboarding proposals (P3). Presentational + local edit/approve state; it
 * consumes the shared `shared/types/onboarding-ingest` contract and never talks
 * to the network itself — the host wires `onCommit` to the governed commit call.
 *
 * Honesty / Part 11 surfaced in the UI:
 *  - Every proposed value shows its PROVENANCE (source file + page/section) and
 *    a CONFIDENCE badge; low-confidence fields are flagged "needs review".
 *  - Nothing is applied until the human clicks Apply — and only fields the human
 *    APPROVED (and left non-empty) are sent. The footer states this plainly.
 *  - A human edit is preserved separately from AnA's original extraction so the
 *    audit can show both.
 */
import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import type {
  OnboardingProposalField,
  OnboardingProposalGroup,
  ProposalStatus,
} from '@shared/types/onboarding-ingest';
import { NEEDS_REVIEW_THRESHOLD } from '@shared/types/onboarding-ingest';
import '../styles/onboarding-review.css';

interface FieldState {
  value: string;
  status: ProposalStatus;
}

export interface OnboardingProposalReviewProps {
  groups: OnboardingProposalGroup[];
  sources?: Array<{ file: string; pages?: number }>;
  warnings?: string[];
  committing?: boolean;
  /** Receives only human-approved, non-empty fields (values reflect edits). */
  onCommit: (approved: OnboardingProposalField[], reason: string) => void;
  onCancel?: () => void;
}

const confidencePct = (c: number) => `${Math.round(Math.max(0, Math.min(1, c)) * 100)}%`;

function provenanceLabel(p: OnboardingProposalField['provenance']): string {
  const loc = p.page != null ? `p.${p.page}` : p.section || '';
  return [p.file, loc].filter(Boolean).join(' · ');
}

export function OnboardingProposalReview({
  groups,
  sources = [],
  warnings = [],
  committing = false,
  onCommit,
  onCancel,
}: OnboardingProposalReviewProps) {
  // Local, human-controlled state keyed by field id. Seeded from the proposal's
  // own value/status so re-review is idempotent.
  const [state, setState] = useState<Record<string, FieldState>>(() => {
    const seed: Record<string, FieldState> = {};
    for (const g of groups) for (const f of g.fields) seed[f.id] = { value: f.value ?? '', status: f.status };
    return seed;
  });
  const [reason, setReason] = useState('');

  const allFields = useMemo(() => groups.flatMap((g) => g.fields), [groups]);
  const approvedCount = allFields.filter(
    (f) => state[f.id]?.status === 'approved' && (state[f.id]?.value ?? '').trim().length > 0,
  ).length;

  const setValue = (id: string, value: string) =>
    setState((s) => {
      const prev = s[id];
      // Editing a value marks it edited unless it was already approved/rejected.
      const status: ProposalStatus =
        prev?.status === 'approved' || prev?.status === 'rejected' ? prev.status : 'edited';
      return { ...s, [id]: { value, status } };
    });
  const setStatus = (id: string, status: ProposalStatus) =>
    setState((s) => ({ ...s, [id]: { value: s[id]?.value ?? '', status } }));

  const approveAll = () =>
    setState((s) => {
      const next = { ...s };
      for (const f of allFields) {
        if ((next[f.id]?.value ?? '').trim().length > 0) next[f.id] = { value: next[f.id].value, status: 'approved' };
      }
      return next;
    });

  /* The reason-for-change is the human's own rationale in a 21 CFR Part 11
     record. It is NEVER synthesized on their behalf — a generated sentence would
     assert that a review happened in words the reviewer never wrote, and would
     make unrelated changes indistinguishable in the audit trail. Apply stays
     disabled until they write one. Matches the governed routes' min length. */
  const REASON_MIN = 10;
  const reasonOk = reason.trim().length >= REASON_MIN;

  const commit = () => {
    const approved: OnboardingProposalField[] = allFields
      .filter((f) => state[f.id]?.status === 'approved' && (state[f.id]?.value ?? '').trim().length > 0)
      .map((f) => {
        const st = state[f.id];
        return { ...f, value: st.value.trim(), status: 'approved' as const };
      });
    if (approved.length === 0 || !reasonOk) return;
    onCommit(approved, reason.trim());
  };

  return (
    <div className="opr">
      <div className="opr-head">
        <div>
          <div className="opr-eyebrow">AnA · onboarding</div>
          <h2 className="opr-title">Review what AnA found</h2>
          <div className="opr-sub">
            Nothing is saved until you apply it. Edit any value, then approve the ones you want — only
            approved fields are written, through the governed audit trail.
          </div>
        </div>
        <button className="opr-approve-all" type="button" onClick={approveAll} disabled={committing}>
          {I.check} Approve all filled
        </button>
      </div>

      {sources.length > 0 && (
        <div className="opr-sources">
          {I.file}
          <span>
            From {sources.map((s) => (s.pages ? `${s.file} (${s.pages}p)` : s.file)).join(', ')}
          </span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="opr-warnings">
          <div className="opr-warn-h">{I.alertTriangle} AnA flagged {warnings.length} thing(s) to check</div>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.entity} className="opr-group">
          <div className="opr-group-h">{g.label}</div>
          {g.fields.length === 0 && <div className="opr-empty">Nothing proposed for this section.</div>}
          {g.fields.map((f) => {
            const st = state[f.id] ?? { value: f.value ?? '', status: f.status };
            const low = f.confidence < NEEDS_REVIEW_THRESHOLD;
            const edited = (st.value ?? '') !== (f.extractedValue ?? '');
            return (
              <div key={f.id} className="opr-field" data-status={st.status} data-low={low || undefined}>
                <div className="opr-field-top">
                  <label className="opr-field-label" htmlFor={`opr-${f.id}`}>
                    {f.label}
                  </label>
                  <span className={`opr-conf${low ? ' low' : ''}`} title="Extraction confidence">
                    {low ? 'needs review' : confidencePct(f.confidence)}
                  </span>
                </div>
                <input
                  id={`opr-${f.id}`}
                  className="opr-field-input"
                  value={st.value}
                  placeholder="—"
                  onChange={(e) => setValue(f.id, e.target.value)}
                  disabled={committing || st.status === 'rejected'}
                />
                <div className="opr-field-foot">
                  <span className="opr-prov" title={f.provenance.snippet || undefined}>
                    {I.link ?? I.file} {provenanceLabel(f.provenance)}
                  </span>
                  {edited && <span className="opr-edited">edited</span>}
                  <span className="opr-actions">
                    <button
                      type="button"
                      className="opr-act approve"
                      aria-pressed={st.status === 'approved'}
                      onClick={() => setStatus(f.id, 'approved')}
                      disabled={committing || (st.value ?? '').trim().length === 0}
                    >
                      {I.check} Approve
                    </button>
                    <button
                      type="button"
                      className="opr-act reject"
                      aria-pressed={st.status === 'rejected'}
                      onClick={() => setStatus(f.id, 'rejected')}
                      disabled={committing}
                    >
                      {I.close ?? '×'} Skip
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <div className="opr-commit">
        <input
          className="opr-reason"
          value={reason}
          placeholder="Reason for change (recorded in the Part 11 audit) — required"
          aria-label="Reason for change"
          onChange={(e) => setReason(e.target.value)}
          disabled={committing}
        />
        {approvedCount > 0 && !reasonOk && (
          <div className="opr-reason-hint">
            Add your reason for this change — it is recorded in the audit trail and cannot be generated for you.
          </div>
        )}
        <div className="opr-commit-actions">
          {onCancel && (
            <button type="button" className="opr-cancel" onClick={onCancel} disabled={committing}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="opr-commit-btn"
            onClick={commit}
            disabled={committing || approvedCount === 0 || !reasonOk}
          >
            {committing ? 'Applying…' : `Apply ${approvedCount} approved field${approvedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
