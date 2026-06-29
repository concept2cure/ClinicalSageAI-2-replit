/**
 * GovernedActionSignoff — inline Part 11 sign-off prompt for a governed action
 * AnA proposed but could not run without authorization.
 *
 * Tiered: every governed action captures a reason-for-change; high-impact
 * actions (revert, dossier placement, submit/sign/freeze) additionally require
 * an electronic signature — a declared §11.50 meaning (AUTHOR / REVIEWER /
 * APPROVER) plus re-authentication (password, and MFA when enabled). Re-auth is
 * captured at signing time, not reused from the session. On confirm it posts to
 * /api/ana-ri/governed-action and reports the outcome inline.
 *
 * Accessibility (WCAG 2.2 AA): a modal dialog with a focus trap and initial
 * focus, real <label>s, a §11.50 meaning radiogroup, an error live region with
 * fields associated via aria-invalid + aria-describedby, a visible focus path,
 * and Escape to cancel.
 */

import { useEffect, useId, useRef, useState } from 'react';

import styles from './styles.module.css';
import { useGovernedAction, type PendingSignoff } from './useGovernedAction';

export interface GovernedActionSignoffProps {
  signoff: PendingSignoff;
  /** Called once the action has been performed (success or hard failure). */
  onResolved: (outcome: { success: boolean; message: string }) => void;
  /** Dismiss the prompt without performing the action. */
  onCancel: () => void;
}

const MIN_REASON_LEN = 10;

/** The §11.50 signature meanings a high-impact governed action may declare. */
const MEANING_OPTIONS: ReadonlyArray<{ value: 'AUTHOR' | 'REVIEWER' | 'APPROVER'; label: string }> = [
  { value: 'AUTHOR', label: 'Authorship' },
  { value: 'REVIEWER', label: 'Review' },
  { value: 'APPROVER', label: 'Approval' },
];
type SignatureMeaning = (typeof MEANING_OPTIONS)[number]['value'];

export function GovernedActionSignoff({ signoff, onResolved, onCancel }: GovernedActionSignoffProps) {
  const { submit, submitting, error } = useGovernedAction();
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [meaning, setMeaning] = useState<SignatureMeaning | null>(null);
  const reasonId = useId();
  const pwId = useId();
  const mfaId = useId();
  const meaningId = useId();
  const titleId = useId();
  const consequenceId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const sig = signoff.signatureRequired;
  const reasonOk = reason.trim().length >= MIN_REASON_LEN;
  const credsOk = !sig || password.length > 0;
  const meaningOk = !sig || meaning != null;
  const canSubmit = reasonOk && credsOk && meaningOk && !submitting;

  // Move focus into the dialog on open so keyboard + screen-reader users start
  // inside the governed prompt (focus trap below keeps them there).
  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLElement>('textarea, input, [role="radio"], button')
      ?.focus();
  }, []);

  // Reason validity is only an error once the user has typed something.
  const reasonInvalid = reason.length > 0 && !reasonOk;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const outcome = await submit({
      command: signoff.command,
      // The declared §11.50 meaning travels with the action for the audit trail.
      params: sig && meaning ? { ...signoff.params, signatureMeaning: meaning } : signoff.params,
      reasonForChange: reason.trim(),
      password: sig ? password : undefined,
      mfaToken: sig && mfaToken ? mfaToken : undefined,
    });
    if (outcome) onResolved(outcome);
  };

  // Focus trap: keep Tab/Shift+Tab inside the dialog; Escape cancels.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [role="radio"], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(el => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      className={styles.signoff}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={consequenceId}
      onKeyDown={handleKeyDown}
    >
      <p id={titleId} className={styles.signoffTitle}>
        {sig ? 'Electronic signature required' : 'Reason for change required'}
      </p>
      <p id={consequenceId} className={styles.signoffMsg}>
        {signoff.message}
      </p>

      <label className={styles.signoffLabel} htmlFor={reasonId}>
        Reason for change
      </label>
      <textarea
        id={reasonId}
        className={styles.signoffInput}
        value={reason}
        onChange={e => setReason(e.target.value)}
        rows={2}
        aria-required="true"
        aria-invalid={reasonInvalid}
        aria-describedby={reasonInvalid ? `${reasonId}-err` : `${reasonId}-hint`}
      />
      {reasonInvalid ? (
        <span id={`${reasonId}-err`} className={styles.signoffError} role="alert">
          Enter at least {MIN_REASON_LEN} characters describing why this change is being made.
        </span>
      ) : (
        <span id={`${reasonId}-hint`} className={styles.signoffHint}>
          At least {MIN_REASON_LEN} characters, recorded to the audit trail.
        </span>
      )}

      {sig && (
        <>
          <span id={meaningId} className={styles.signoffLabel}>
            Meaning of signature (§11.50)
          </span>
          <div className={styles.signoffMeanings} role="radiogroup" aria-labelledby={meaningId} aria-required="true">
            {MEANING_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={meaning === opt.value}
                data-active={meaning === opt.value}
                className={styles.signoffMeaning}
                onClick={() => setMeaning(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className={styles.signoffLabel} htmlFor={pwId}>
            Password (electronic signature)
          </label>
          <input
            id={pwId}
            type="password"
            autoComplete="current-password"
            className={styles.signoffInput}
            value={password}
            onChange={e => setPassword(e.target.value)}
            aria-required="true"
          />
          <label className={styles.signoffLabel} htmlFor={mfaId}>
            Authentication code (if enabled)
          </label>
          <input
            id={mfaId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className={styles.signoffInput}
            value={mfaToken}
            onChange={e => setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <p className={styles.signoffAttest}>
            By signing, you confirm the §11.50 meaning above and your 21 CFR 11.100(b) intent. Your
            credentials are verified at signing and are not reused from this session.
          </p>
        </>
      )}

      {error && (
        <p className={styles.signoffError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.signoffActions}>
        <button type="button" className={styles.suggestPill} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.signoffConfirm}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? 'Signing…' : sig ? 'Sign and run' : 'Confirm and run'}
        </button>
      </div>
    </div>
  );
}
