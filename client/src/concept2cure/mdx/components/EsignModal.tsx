/**
 * <EsignModal> — 21 CFR Part 11 e-signature flow.
 *
 * Triggered by every governed mutation across the MDX platform: approve
 * CAPA, sign artifact, accept AnA draft, transmit submission, grant
 * access. The mutation is held in flight until step 3 commits.
 *
 * 3-step flow:
 *   1. Reason for action (free text, min 8 chars) + meaning enum
 *   2. Identity re-challenge (password + 6-digit TOTP)
 *   3. Confirmation — shows signing manifest entry before commit
 *
 * The server-side commit endpoint (`POST /api/mdx/esig/commit`) validates
 * password + TOTP, writes the SHA-256-chained audit entry, then executes
 * the held mutation. The modal's `onConfirm` callback should POST the
 * manifest and only execute the mutation after a 2xx response.
 *
 * Port basis: design-system/ui_kits/mdx/esign-modal.jsx.
 */

import * as React from 'react';
import { I } from '../icons';

export type EsigMeaning =
  | 'reviewed'
  | 'approved'
  | 'responsibility'
  | 'authorship';

const MEANINGS: ReadonlyArray<{ id: EsigMeaning; label: string; desc: string }> = [
  {
    id: 'reviewed',
    label: 'Reviewed',
    desc: 'Acknowledges I have read and assessed this',
  },
  {
    id: 'approved',
    label: 'Approved',
    desc: 'Authorizes this artifact for release',
  },
  {
    id: 'responsibility',
    label: 'Responsibility',
    desc: 'Asserts I am responsible for the content',
  },
  {
    id: 'authorship',
    label: 'Authorship',
    desc: 'Identifies me as the author',
  },
];

export interface EsigManifest {
  reason: string;
  meaning: EsigMeaning;
  /** Password the user typed for re-challenge — caller forwards to the
   *  commit endpoint and must NOT persist or log this value client-side. */
  password: string;
  /** Authenticator code — same handling rule. */
  totp: string;
}

export interface EsignModalProps {
  open: boolean;
  /** Human-readable action name, e.g. "Approve CAPA-0042". */
  action: string;
  /** Specific target — usually mono-styled, e.g. an artifact id. */
  target: string;
  /** Pre-select a meaning. Defaults to 'approved'. */
  defaultMeaning?: EsigMeaning;
  /** Identity displayed in step 2 ("you, the signer"). */
  signer?: { name: string; email: string; role: string; lastSigned?: string };
  onCancel: () => void;
  /** Receives the manifest. Caller posts to /api/mdx/esig/commit, awaits
   *  the response, and only then proceeds with the held mutation. The
   *  modal stays open while the promise is unresolved (showing "Sealing
   *  chain…"). Resolve to close. Reject to surface the error inline via
   *  `submitError` (caller's responsibility to update state). */
  onConfirm: (manifest: EsigManifest) => Promise<void> | void;
  /** Optional error from a failed commit — surfaced in step 3. */
  submitError?: string | null;
}

const DEFAULT_SIGNER: NonNullable<EsignModalProps['signer']> = {
  name: 'You',
  email: '',
  role: '',
};

export function EsignModal({
  open,
  action,
  target,
  defaultMeaning,
  signer = DEFAULT_SIGNER,
  onCancel,
  onConfirm,
  submitError,
}: EsignModalProps) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [reason, setReason] = React.useState('');
  const [meaning, setMeaning] = React.useState<EsigMeaning>(
    defaultMeaning ?? 'approved',
  );
  const [password, setPassword] = React.useState('');
  const [totp, setTotp] = React.useState('');
  const [committing, setCommitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setReason('');
      setPassword('');
      setTotp('');
      setCommitting(false);
    }
  }, [open]);

  if (!open) return null;

  const canStep2 = reason.trim().length >= 8;
  const canCommit = password.length >= 8 && totp.length === 6;
  const meaningDef = MEANINGS.find((m) => m.id === meaning);

  const commit = async () => {
    setCommitting(true);
    try {
      await onConfirm({ reason, meaning, password, totp });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div
      className="esig-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="E-signature required"
    >
      <div className="esig-modal">
        <div className="esig-head">
          <span className="esig-mark">{I.shieldCheck}</span>
          <div>
            <div className="esig-eyebrow">21 CFR Part 11 · e-signature</div>
            <div className="esig-title">{action}</div>
            <div className="esig-target">{target}</div>
          </div>
          <button
            className="esig-close"
            onClick={onCancel}
            title="Cancel"
            type="button"
            aria-label="Cancel"
          >
            {I.close}
          </button>
        </div>

        <div className="esig-steps">
          <span className={`esig-step ${step >= 1 ? 'on' : ''}`}>1 · Reason</span>
          <span className="esig-step-sep" />
          <span className={`esig-step ${step >= 2 ? 'on' : ''}`}>
            2 · Identity
          </span>
          <span className="esig-step-sep" />
          <span className={`esig-step ${step >= 3 ? 'on' : ''}`}>3 · Commit</span>
        </div>

        {step === 1 && (
          <div className="esig-body">
            <label className="esig-label" htmlFor="esig-reason">
              Reason for this action
            </label>
            <textarea
              id="esig-reason"
              className="esig-input esig-textarea"
              rows={3}
              placeholder="A short, specific reason. Becomes part of the immutable audit entry."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <div className="esig-hint">
              Minimum 8 characters · stored verbatim in the audit log
            </div>

            <label className="esig-label" style={{ marginTop: 16 }}>
              Signature meaning
            </label>
            <div className="esig-meanings">
              {MEANINGS.map((m) => (
                <button
                  key={m.id}
                  className="esig-meaning"
                  data-on={meaning === m.id || undefined}
                  onClick={() => setMeaning(m.id)}
                  type="button"
                >
                  <span className="esig-meaning-label">{m.label}</span>
                  <span className="esig-meaning-desc">{m.desc}</span>
                </button>
              ))}
            </div>

            <div className="esig-foot">
              <button className="btn ghost small" onClick={onCancel} type="button">
                Cancel
              </button>
              <button
                className="btn primary small"
                disabled={!canStep2}
                onClick={() => setStep(2)}
                type="button"
              >
                Continue {I.arrowRight}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="esig-body">
            <div className="esig-identity">
              <div className="esig-identity-name">
                {signer.name}
                {signer.email && ` · ${signer.email}`}
              </div>
              <div className="esig-identity-role">
                {signer.role}
                {signer.lastSigned && ` · last signed ${signer.lastSigned}`}
              </div>
            </div>

            <label className="esig-label" htmlFor="esig-password">
              Password
            </label>
            <input
              id="esig-password"
              type="password"
              className="esig-input"
              placeholder="Your account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />

            <label
              className="esig-label"
              style={{ marginTop: 12 }}
              htmlFor="esig-totp"
            >
              Authenticator code (TOTP)
            </label>
            <input
              id="esig-totp"
              className="esig-input esig-totp"
              placeholder="6-digit code"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totp}
              onChange={(e) =>
                setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
            />
            <div className="esig-hint">
              Re-challenge is required per signing event · never persistent
            </div>

            <div className="esig-foot">
              <button
                className="btn ghost small"
                onClick={() => setStep(1)}
                type="button"
              >
                ← Back
              </button>
              <button
                className="btn primary small"
                disabled={!canCommit}
                onClick={() => setStep(3)}
                type="button"
              >
                Continue {I.arrowRight}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="esig-body">
            <div className="esig-summary">
              <div className="esig-summary-lbl">Signing manifest preview</div>
              <div className="esig-summary-row">
                <span className="k">Action</span>
                <span className="v">{action}</span>
              </div>
              <div className="esig-summary-row">
                <span className="k">Target</span>
                <span className="v mono small">{target}</span>
              </div>
              <div className="esig-summary-row">
                <span className="k">Signer</span>
                <span className="v">
                  {signer.name}
                  {signer.email && ` · ${signer.email}`}
                </span>
              </div>
              <div className="esig-summary-row">
                <span className="k">Meaning</span>
                <span className="v">{meaningDef?.label}</span>
              </div>
              <div className="esig-summary-row">
                <span className="k">Reason</span>
                <span className="v">{reason}</span>
              </div>
              <div className="esig-summary-row">
                <span className="k">Timestamp</span>
                <span className="v mono small">
                  will be recorded at commit
                </span>
              </div>
              <div className="esig-summary-row">
                <span className="k">Chain hash</span>
                <span className="v mono tiny">
                  SHA-256 over (prev_hash || event)
                </span>
              </div>
            </div>

            <div className="esig-hint">
              On commit: the action executes, an audit-log entry is written
              with the chain hash, and the signing manifest becomes part of
              the artifact&apos;s history. This cannot be undone.
            </div>

            {submitError && (
              <div className="esig-error" role="alert">
                {submitError}
              </div>
            )}

            <div className="esig-foot">
              <button
                className="btn ghost small"
                onClick={() => setStep(2)}
                disabled={committing}
                type="button"
              >
                ← Back
              </button>
              <button
                className="btn primary small"
                onClick={commit}
                disabled={committing}
                type="button"
              >
                {committing ? (
                  'Sealing chain…'
                ) : (
                  <>
                    {I.shieldCheck} Sign and commit
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
