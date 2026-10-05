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

import { Fragment, useEffect, useId, useRef, useState } from 'react';

import { GOVERNED_SIGNATURE_ATTESTATION } from '@shared/constants/signature-attestation';

import { AnswerCheckRows } from './AnswerCheckRows';
import styles from './styles.module.css';
import { tierOf, useGovernedAction, type DeclaredMeaning, type PendingSignoff } from './useGovernedAction';

export interface GovernedActionSignoffProps {
  signoff: PendingSignoff;
  /** Called once the action has been performed (success or hard failure). */
  onResolved: (outcome: { success: boolean; message: string }) => void;
  /** Dismiss the prompt without performing the action. */
  onCancel: () => void;
}

const MIN_REASON_LEN = 10;

/** The §11.50 signature meanings, as offered. */
const MEANING_OPTIONS: ReadonlyArray<{ value: DeclaredMeaning; label: string }> = [
  { value: 'AUTHOR', label: 'Authorship' },
  { value: 'REVIEWER', label: 'Review' },
  { value: 'APPROVER', label: 'Approval' },
  { value: 'RELEASE', label: 'Release' },
];
/** What a high-impact action may declare when its act fixes no meaning. */
const CHOOSABLE: ReadonlySet<DeclaredMeaning> = new Set(['AUTHOR', 'REVIEWER', 'APPROVER']);
type SignatureMeaning = DeclaredMeaning;

/** The inputs a governed tool carries its reason for change in (server
 *  stated-reason-input.ts reasonFieldOf). The reason is not a parameter to
 *  summarise: it is asked for on its own, in full. */
const REASON_KEYS = ['reason', 'reason_for_change'] as const;

/** The reason AnA wrote into the call, if any — shown whole, never recorded as the person's unless they adopt it. */
function proposedReasonOf(params: Record<string, unknown>): string | null {
  for (const k of REASON_KEYS) {
    const v = params?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** The name an item of a proposed list goes by (a section's title), if it has one. */
function itemName(item: unknown): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const rec = item as Record<string, unknown>;
  for (const k of ['title', 'heading', 'name', 'label'] as const) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * A proposed list as a person reads it: its items by name ("Efficacy ·
 * Safety") when every item has one, else a count. Until 2026-10-05 a drafted
 * document read "sections: 3 items" (GRD-2).
 */
function listSummary(list: unknown[]): string {
  const names = list.map(itemName);
  if (list.length > 0 && names.every((n): n is string => n !== null)) return names.join(' · ');
  return `${list.length} item${list.length === 1 ? '' : 's'}`;
}

/** A compact, readable key: value list of what AnA proposed — never a raw JSON dump. */
function summariseParams(params: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(params ?? {})) {
    if (out.length >= 8) break;
    if ((REASON_KEYS as readonly string[]).includes(k)) continue;
    if (v === undefined || v === null || v === '') continue;
    const text =
      typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Array.isArray(v) ? listSummary(v) : 'details';
    out.push([k, text.length > 80 ? `${text.slice(0, 77)}…` : text]);
  }
  return out;
}

export function GovernedActionSignoff({ signoff, onResolved, onCancel }: GovernedActionSignoffProps) {
  const { submit, decline, submitting, error } = useGovernedAction();

  // Declining a live prompt tells the run that is waiting on it, so AnA carries
  // on now rather than at the pause ceiling. A prompt from a finished turn has
  // nothing waiting; closing it is the whole of declining.
  const handleCancel = async () => {
    if (signoff.runId && signoff.toolUseId) {
      await decline({ runId: signoff.runId, toolUseId: signoff.toolUseId });
    }
    onCancel();
  };
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  // An act that fixes its meaning (approving an artifact: Approval; locking it:
  // Release) offers that one, already chosen; the server refuses any other.
  const offered = signoff.signatureMeaning
    ? MEANING_OPTIONS.filter(o => o.value === signoff.signatureMeaning)
    : MEANING_OPTIONS.filter(o => CHOOSABLE.has(o.value));
  const [meaning, setMeaning] = useState<SignatureMeaning | null>(signoff.signatureMeaning ?? null);
  const reasonId = useId();
  const pwId = useId();
  const mfaId = useId();
  const meaningId = useId();
  const titleId = useId();
  const consequenceId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const tier = signoff.tier ?? tierOf(signoff);
  // The confirm tier: an explicit yes, no reason, no credentials (the ordinary
  // writes AnA proposes; the server requires only `confirm: true`).
  const confirmOnly = tier === 'confirm';
  const sig = tier === 'esignature';
  const reasonOk = reason.trim().length >= MIN_REASON_LEN;
  const credsOk = !sig || password.length > 0;
  const meaningOk = !sig || meaning != null;
  const canSubmit = confirmOnly ? !submitting : reasonOk && credsOk && meaningOk && !submitting;

  // Move focus into the dialog on open so keyboard + screen-reader users start
  // inside the governed prompt (focus trap below keeps them there).
  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLElement>('textarea, input, [role="radio"], button')
      ?.focus();
  }, []);

  // Reason validity is only an error once the user has typed something.
  const reasonInvalid = reason.length > 0 && !reasonOk;
  // What AnA wrote as the reason. The field starts empty: the reason recorded
  // is the one the person types or explicitly adopts (D5, 2026-09-29).
  const proposedReason = confirmOnly ? null : proposedReasonOf(signoff.params);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (confirmOnly) {
      const confirmed = await submit({
        command: signoff.command,
        params: signoff.params,
        confirm: true,
        runId: signoff.runId,
        toolUseId: signoff.toolUseId,
      });
      if (confirmed) onResolved(confirmed);
      return;
    }
    const outcome = await submit({
      command: signoff.command,
      // The declared §11.50 meaning travels with the action for the audit trail.
      params: sig && meaning ? { ...signoff.params, signatureMeaning: meaning } : signoff.params,
      reasonForChange: reason.trim(),
      password: sig ? password : undefined,
      mfaToken: sig && mfaToken ? mfaToken : undefined,
      // Present only when AnA is holding a turn on this. The server then takes
      // the command and params from the run row rather than from this body, so
      // these two are routing information, not the request itself.
      runId: signoff.runId,
      toolUseId: signoff.toolUseId,
    });
    if (outcome) onResolved(outcome);
  };

  // Focus trap: keep Tab/Shift+Tab inside the dialog; Escape cancels.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      void handleCancel();
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
        {confirmOnly ? 'Confirm the proposed action' : sig ? 'Electronic signature required' : 'Reason for change required'}
      </p>
      <p id={consequenceId} className={styles.signoffMsg}>
        {signoff.message}
      </p>

      {(confirmOnly || proposedReason) && (
        <dl className={styles.signoffHint} aria-label="What AnA proposed">
          <dt>Action</dt>
          <dd>{signoff.command}</dd>
          {summariseParams(signoff.params).map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {/* The server's check of what AnA wrote for the record, against what she
          consulted before she wrote it (GRD-2): read before the person
          approves, in the strip's own rows. It informs; it does not decide. */}
      {signoff.check && (
        <div className="ana-grounding" data-testid="signoff-proposal-check">
          <p className={styles.signoffLabel}>What this draft states, checked against this turn's sources</p>
          <AnswerCheckRows check={signoff.check} />
        </div>
      )}
      {!confirmOnly && (
        <label className={styles.signoffLabel} htmlFor={reasonId}>
          Reason for change
        </label>
      )}
      {proposedReason && (
        <p className={styles.signoffHint} data-testid="signoff-proposed-reason">
          AnA suggested: “{proposedReason}”{' '}
          <button type="button" className={styles.suggestPill} onClick={() => setReason(proposedReason)}>
            Use AnA’s wording
          </button>
        </p>
      )}
      {!confirmOnly && (
        <>
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
        </>
      )}

      {sig && (
        <>
          <span id={meaningId} className={styles.signoffLabel}>
            Meaning of signature (§11.50)
          </span>
          <div className={styles.signoffMeanings} role="radiogroup" aria-labelledby={meaningId} aria-required="true">
            {offered.map(opt => (
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
          <p className={styles.signoffAttest}>{GOVERNED_SIGNATURE_ATTESTATION}</p>
        </>
      )}

      {error && (
        <p className={styles.signoffError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.signoffActions}>
        <button type="button" className={styles.suggestPill} onClick={() => void handleCancel()} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.signoffConfirm}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (confirmOnly ? 'Running…' : 'Signing…') : sig ? 'Sign and run' : 'Confirm and run'}
        </button>
      </div>
    </div>
  );
}
