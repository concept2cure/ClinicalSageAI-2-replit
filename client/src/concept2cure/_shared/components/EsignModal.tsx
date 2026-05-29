/**
 * <EsignModal> — shared 21 CFR Part 11 e-signature / governed-action modal.
 *
 * The single gate for governed mutations across concept2cure (CMC batch
 * release, artifact approval, submission transmit, access grant). Promoted
 * and rebuilt from `mdx/components/EsignModal.tsx`; wired to the REAL backend
 * at `/api/esignature/*` (not the non-existent `/api/c2c/actions/sign`).
 *
 * Part 11 coverage:
 *   §11.50  — signature meaning selector (authorship / review / approval /
 *             responsibility / release) plus required reason-for-change.
 *   §11.100 — signer identity shown; the act is bound to the current user.
 *   §11.200 — re-authentication before signing: password (always) and TOTP
 *             (when the signer is MFA-enrolled, via `requireMfa`).
 *
 * Flow: capture meaning + reason → re-authenticate (verify-password and, if
 * required, verify-mfa) → on success call `onSign({ meaning, reason, ... })`.
 * The caller runs the actual governed mutation and resolves to a manifest;
 * the modal shows the signed confirmation (who, when, meaning, reason, hash).
 * A verify or sign failure surfaces inline via role="alert" — no fabricated
 * success.
 *
 * Accessibility (WCAG 2.2 AA): role="dialog" aria-modal, labelled by the
 * title, focus trapped inside, focus returned to the trigger on close, Esc
 * closes (when not committing), every input labelled, errors announced.
 *
 * @module client/src/concept2cure/_shared/components/EsignModal
 */

import * as React from 'react';
import { useEsignature, type EsigMeaning } from '../../hooks/useEsignature';
import './EsignModal.css';

// ── Inline Lucide icons (stroke, currentColor) ───────────────────────────────

const Ico = ({ children, size = 16 }: { children: React.ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const IconPen = () => (
  <Ico>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </Ico>
);
const IconClose = () => (
  <Ico><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Ico>
);
const IconCheck = () => (
  <Ico size={22}><polyline points="20 6 9 17 4 12" /></Ico>
);
const IconAlert = () => (
  <Ico size={14}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Ico>
);
const IconShield = () => (
  <Ico size={13}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </Ico>
);

// ── Signature meanings (§11.50 closed enum) ──────────────────────────────────

const MEANINGS: ReadonlyArray<{ id: EsigMeaning; label: string; desc: string }> = [
  { id: 'authorship', label: 'Authorship', desc: 'You authored this content' },
  { id: 'review', label: 'Review', desc: 'You reviewed this content' },
  { id: 'approval', label: 'Approval', desc: 'You approve this content for use' },
  { id: 'responsibility', label: 'Responsibility', desc: 'You take responsibility for this content' },
  { id: 'release', label: 'Release', desc: 'You authorize release or submission' },
];

const MIN_REASON = 8;
const MIN_PASSWORD = 6;

// ── Types ────────────────────────────────────────────────────────────────────

export interface EsigSignedManifest {
  meaning: EsigMeaning;
  reason: string;
  /** ISO timestamp recorded when the signed action committed. */
  signedAt: string;
  /** Optional integrity hash returned by the governed action. */
  hash?: string;
}

export interface EsignSigner {
  name: string;
  email?: string;
  role?: string;
}

export interface EsignModalProps {
  open: boolean;
  /** Human-readable action, e.g. "Release batch". */
  action: string;
  /** The specific target, e.g. a batch number. */
  target: string;
  /** Optional secondary line under the target. */
  targetMeta?: string;
  /** Pre-select a meaning. Defaults to 'approval'. */
  defaultMeaning?: EsigMeaning;
  /** Identity shown as the signer. Server is the source of truth at /sign. */
  signer?: EsignSigner;
  /** Require a TOTP second factor (set when the signer is MFA-enrolled). */
  requireMfa?: boolean;
  /** Close without signing (cancel / Esc / overlay). */
  onClose: () => void;
  /**
   * Runs after re-authentication succeeds. Perform the real governed mutation
   * here (e.g. POST the batch release). Resolve with the committed manifest to
   * show the signed confirmation; reject to surface an inline error.
   */
  onSign: (input: { meaning: EsigMeaning; reason: string }) => Promise<EsigSignedManifest>;
}

// ── Focus trap helper ────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '--';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function EsignModal({
  open,
  action,
  target,
  targetMeta,
  defaultMeaning,
  signer,
  requireMfa = false,
  onClose,
  onSign,
}: EsignModalProps) {
  const esig = useEsignature();

  const [meaning, setMeaning] = React.useState<EsigMeaning>(defaultMeaning ?? 'approval');
  const [reason, setReason] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [totp, setTotp] = React.useState('');
  const [phase, setPhase] = React.useState<'form' | 'committing' | 'signed'>('form');
  const [manifest, setManifest] = React.useState<EsigSignedManifest | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const modalRef = React.useRef<HTMLDivElement>(null);
  const firstFieldRef = React.useRef<HTMLTextAreaElement>(null);
  const titleId = React.useId();
  const reasonId = React.useId();
  const pwId = React.useId();
  const totpId = React.useId();
  const errorId = React.useId();
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  // Reset state when opened; remember the trigger to restore focus on close.
  React.useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      setMeaning(defaultMeaning ?? 'approval');
      setReason('');
      setPassword('');
      setTotp('');
      setPhase('form');
      setManifest(null);
      setError(null);
      const t = window.setTimeout(() => firstFieldRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, defaultMeaning]);

  // Restore focus to the trigger when closing.
  React.useEffect(() => {
    if (!open && restoreFocusRef.current) {
      restoreFocusRef.current.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  const handleClose = React.useCallback(() => {
    if (phase === 'committing') return;
    onClose();
  }, [phase, onClose]);

  // Esc to close + focus trap.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key === 'Tab') {
        const root = modalRef.current;
        if (!root) return;
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, handleClose]);

  if (!open) return null;

  const canCommit =
    reason.trim().length >= MIN_REASON &&
    password.length >= MIN_PASSWORD &&
    (!requireMfa || /^\d{6}$/.test(totp));

  const commit = async () => {
    if (!canCommit) return;
    setError(null);
    setPhase('committing');
    try {
      // §11.200 re-authentication against the real backend.
      const pw = await esig.verifyPassword(password);
      if (!pw.valid) {
        setError('Password could not be verified. Re-enter it and try again.');
        setPhase('form');
        return;
      }
      if (requireMfa) {
        const mfa = await esig.verifyMfa(totp);
        if (!mfa.valid) {
          setError('Authenticator code could not be verified. Enter a current code.');
          setPhase('form');
          return;
        }
      }
      // Re-auth passed. Run the caller's governed mutation.
      const signed = await onSign({ meaning, reason: reason.trim() });
      setManifest(signed);
      setPhase('signed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'The signed action could not be completed.';
      setError(msg);
      setPhase('form');
    }
  };

  const meaningObj = MEANINGS.find((m) => m.id === meaning) ?? MEANINGS[2];
  const signerName = signer?.name ?? 'You';
  const committing = phase === 'committing';

  return (
    <div
      className="es-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={modalRef}
        className="es-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {phase === 'signed' && manifest ? (
          <div className="es-done">
            <div className="es-done-mark">
              <IconCheck />
            </div>
            <h3 id={titleId}>Signature applied</h3>
            <p>
              {meaningObj.label} signature recorded against {target}. The 21 CFR Part 11 audit
              trail has a new entry. This cannot be undone.
            </p>
            <div className="es-manifest">
              <div className="es-manifest-row">
                <span>Action</span>
                <span>{action}</span>
              </div>
              <div className="es-manifest-row">
                <span>Signed by</span>
                <span>
                  {signerName}
                  {signer?.email ? ` · ${signer.email}` : ''}
                </span>
              </div>
              <div className="es-manifest-row">
                <span>Meaning</span>
                <span>{meaningObj.label}</span>
              </div>
              <div className="es-manifest-row">
                <span>Reason</span>
                <span>{manifest.reason}</span>
              </div>
              <div className="es-manifest-row">
                <span>When</span>
                <span className="es-mono">{new Date(manifest.signedAt).toLocaleString()}</span>
              </div>
              {manifest.hash ? (
                <div className="es-manifest-row">
                  <span>Chain</span>
                  <span className="es-mono">{manifest.hash}</span>
                </div>
              ) : null}
            </div>
            <div className="es-foot">
              <button className="es-btn-primary" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="es-head">
              <span className="es-head-ico">
                <IconPen />
              </span>
              <div>
                <div className="es-head-title" id={titleId}>
                  Electronic signature
                </div>
                <div className="es-head-sub">21 CFR Part 11 {'·'} {'§'}11.50 {'·'} {'§'}11.100 {'·'} {'§'}11.200</div>
              </div>
              <button
                className="es-close"
                type="button"
                onClick={handleClose}
                disabled={committing}
                aria-label="Cancel signing"
              >
                <IconClose />
              </button>
            </div>

            <div className="es-target">
              <span className="es-target-lbl">You are signing</span>
              <div className="es-target-name">{target}</div>
              {targetMeta ? <div className="es-target-meta">{targetMeta}</div> : null}
              <div className="es-identity">
                <span className="es-identity-avatar" aria-hidden="true">
                  {initials(signerName)}
                </span>
                <div>
                  <div className="es-identity-name">{signerName}</div>
                  <div className="es-identity-role">
                    {signer?.email ?? signer?.role ?? 'Current signer'}
                  </div>
                </div>
              </div>
            </div>

            <fieldset className="es-field" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="es-field-lbl">Signature meaning {'·'} {'§'}11.50</legend>
              <div className="es-meaning" role="radiogroup" aria-label="Signature meaning">
                {MEANINGS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="es-meaning-opt"
                    role="radio"
                    aria-checked={meaning === m.id}
                    data-active={meaning === m.id || undefined}
                    onClick={() => setMeaning(m.id)}
                    disabled={committing}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <span className="es-field-hint">{meaningObj.desc}</span>
            </fieldset>

            <div className="es-field">
              <label className="es-field-lbl" htmlFor={reasonId}>
                Reason for this action
              </label>
              <textarea
                ref={firstFieldRef}
                id={reasonId}
                rows={2}
                placeholder="A short, specific reason. Stored verbatim in the audit trail."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={committing}
                aria-describedby={`${reasonId}-hint`}
              />
              <span className="es-field-hint" id={`${reasonId}-hint`}>
                Minimum {MIN_REASON} characters.
              </span>
            </div>

            <div className="es-field">
              <label className="es-field-lbl" htmlFor={pwId}>
                Password {'·'} {'§'}11.200
              </label>
              <input
                id={pwId}
                type="password"
                autoComplete="current-password"
                placeholder="Your account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={committing}
              />
            </div>

            {requireMfa ? (
              <div className="es-field">
                <label className="es-field-lbl" htmlFor={totpId}>
                  Authenticator code (TOTP)
                </label>
                <input
                  id={totpId}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={committing}
                  aria-describedby={`${totpId}-hint`}
                />
                <span className="es-field-hint" id={`${totpId}-hint`}>
                  Re-challenge is required per signing event. Never stored.
                </span>
              </div>
            ) : null}

            {error ? (
              <div className="es-error" role="alert" id={errorId}>
                <span className="es-error-ico">
                  <IconAlert />
                </span>
                {error}
              </div>
            ) : null}

            <div className="es-foot">
              <button
                className="es-btn-secondary"
                type="button"
                onClick={handleClose}
                disabled={committing}
              >
                Cancel
              </button>
              <button
                className="es-btn-primary"
                type="button"
                onClick={commit}
                disabled={!canCommit || committing}
                aria-describedby={error ? errorId : undefined}
              >
                {committing ? (
                  <>
                    <span className="es-spin" aria-hidden="true" />
                    Signing
                  </>
                ) : (
                  <>
                    <IconShield />
                    Sign and commit
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default EsignModal;
