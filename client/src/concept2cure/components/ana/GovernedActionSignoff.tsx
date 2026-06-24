/**
 * GovernedActionSignoff — inline Part 11 sign-off prompt for a governed action
 * AnA proposed but could not run without authorization.
 *
 * Tiered: every governed action captures a reason-for-change; high-impact
 * actions (revert, dossier placement, submit/sign/freeze) additionally require
 * re-authentication (password, and MFA when enabled). On confirm it posts to
 * /api/ana-ri/governed-action and reports the outcome inline.
 *
 * Accessibility (WCAG 2.2 AA): real <label>s, an error live region, a visible
 * focus path, and Escape to cancel.
 */

import { useId, useState } from 'react';

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

export function GovernedActionSignoff({ signoff, onResolved, onCancel }: GovernedActionSignoffProps) {
  const { submit, submitting, error } = useGovernedAction();
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const reasonId = useId();
  const pwId = useId();
  const mfaId = useId();

  const reasonOk = reason.trim().length >= MIN_REASON_LEN;
  const credsOk = !signoff.signatureRequired || password.length > 0;
  const canSubmit = reasonOk && credsOk && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const outcome = await submit({
      command: signoff.command,
      params: signoff.params,
      reasonForChange: reason.trim(),
      password: signoff.signatureRequired ? password : undefined,
      mfaToken: signoff.signatureRequired && mfaToken ? mfaToken : undefined,
    });
    if (outcome) onResolved(outcome);
  };

  return (
    <section
      className={styles.signoff}
      aria-label={signoff.signatureRequired ? 'Electronic signature required' : 'Reason for change required'}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <p className={styles.signoffMsg}>{signoff.message}</p>

      <label className={styles.signoffLabel} htmlFor={reasonId}>
        Reason for change
      </label>
      <textarea
        id={reasonId}
        className={styles.signoffInput}
        value={reason}
        onChange={e => setReason(e.target.value)}
        rows={2}
        aria-describedby={`${reasonId}-hint`}
        aria-invalid={reason.length > 0 && !reasonOk}
      />
      <span id={`${reasonId}-hint`} className={styles.signoffHint}>
        At least {MIN_REASON_LEN} characters, recorded to the audit trail.
      </span>

      {signoff.signatureRequired && (
        <>
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
          {submitting ? 'Signing…' : signoff.signatureRequired ? 'Sign & run' : 'Confirm & run'}
        </button>
      </div>
    </section>
  );
}
