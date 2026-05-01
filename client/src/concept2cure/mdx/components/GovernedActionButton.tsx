/**
 * GovernedActionButton — Part-11-correct wrapper for any mutation.
 *
 * Every governed action in the regulatory operating system must:
 *   1. Capture a reason-for-change (free text, required for 21 CFR 11)
 *   2. Verify identity via e-signature (existing ElectronicSignatureGate)
 *   3. Write an immutable audit-log row (server-side, via auditService)
 *   4. Only then run the actual mutation
 *
 * This component is the single entry point. It renders a button; on click
 * it walks the user through the reason → sign → mutate → log chain. If any
 * step fails the mutation does not run.
 *
 * The visual currently delegates to the legacy-esign island's
 * ElectronicSignatureGate engine (Part-11-compliant but pre-Claude-Design,
 * relocated from portal-v2 in Action C of UI_MIGRATION_MAP_2026-05-01).
 * When Claude Design ships an e-sign kit, swap the inner Gate without
 * changing this file's contract — every consumer keeps working.
 *
 * Usage:
 *
 *   <GovernedActionButton
 *     action="submit-510k"
 *     meaning="approval"
 *     recordId={project.id}
 *     recordType="fda510k_submission"
 *     onConfirm={async (ctx) => {
 *       await api.submit510k(project.id, { reason: ctx.reason });
 *     }}
 *   >
 *     Submit to FDA
 *   </GovernedActionButton>
 */

import * as React from 'react';
import {
  ElectronicSignatureGate,
  type ElectronicSignature,
  type SignatureRequiredAction,
  type SignatureMeaning,
} from '@/components/legacy-esign/ElectronicSignature';

export interface GovernedActionContext {
  reason: string;
  signature: ElectronicSignature;
}

export interface GovernedActionButtonProps {
  /** Audit-trail action label, e.g. 'submit-510k', 'approve-cer-section'. */
  action: SignatureRequiredAction;
  /** 11.50(b) meaning: authorship | review | approval | verification | amendment | release. */
  meaning: SignatureMeaning;
  /** Identifier of the record being acted on (project id, document id, …). */
  recordId: string;
  /** Type label of the record (fda510k_submission, cer_section, claim, …). */
  recordType: string;
  /** Free-text label shown in the reason-for-change capture step. Defaults
   *  to "Why are you taking this action?" */
  reasonPrompt?: string;
  /** When true, the reason field is required (recommended for governed
   *  actions). Default true. */
  requireReason?: boolean;
  /** Disable the button. Render-time gate; for runtime authorization, also
   *  enforce on the backend. */
  disabled?: boolean;
  /** Inline busy state during the mutation, after sign-off. */
  busy?: boolean;
  /** Visual style: primary (terracotta) or ghost (outlined). */
  variant?: 'primary' | 'ghost';
  /** Compact button size. */
  size?: 'small' | 'medium';
  /** The actual mutation. Called once reason + signature are captured. */
  onConfirm: (ctx: GovernedActionContext) => void | Promise<void>;
  /** Optional cancel hook for analytics. */
  onCancel?: () => void;
  /** Button label (children). */
  children: React.ReactNode;
}

type Step = 'idle' | 'reason' | 'signing' | 'busy';

export function GovernedActionButton({
  action,
  meaning,
  recordId,
  recordType,
  reasonPrompt = 'Why are you taking this action?',
  requireReason = true,
  disabled = false,
  busy: externalBusy = false,
  variant = 'primary',
  size = 'medium',
  onConfirm,
  onCancel,
  children,
}: GovernedActionButtonProps) {
  const [step, setStep] = React.useState<Step>('idle');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setStep('idle');
    setReason('');
    setError(null);
  };
  const cancel = () => {
    reset();
    onCancel?.();
  };

  const handleSigned = async (signature: ElectronicSignature) => {
    setStep('busy');
    try {
      await onConfirm({ reason: reason.trim(), signature });
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
      setStep('idle');
    }
  };

  const start = () => {
    if (disabled || externalBusy || step !== 'idle') return;
    setStep('reason');
  };
  const submitReason = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && !reason.trim()) {
      setError('A reason for change is required.');
      return;
    }
    setError(null);
    setStep('signing');
  };

  const isBusy = step === 'busy' || externalBusy;

  return (
    <>
      <button
        type="button"
        className={`gov-action-btn ${variant} ${size}`}
        onClick={start}
        disabled={disabled || isBusy}
        aria-busy={isBusy}
      >
        {isBusy ? 'Working…' : children}
      </button>

      {step === 'reason' && (
        <div
          className="gov-action-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gov-action-title"
        >
          <form className="gov-action-card" onSubmit={submitReason}>
            <div className="gov-action-eyebrow">Reason for change · 21 CFR Part 11</div>
            <h2 id="gov-action-title" className="gov-action-title">{reasonPrompt}</h2>
            <textarea
              className="gov-action-textarea"
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Briefly describe why you're taking this action…"
              rows={4}
              required={requireReason}
            />
            {error && <div className="gov-action-error">{error}</div>}
            <div className="gov-action-actions">
              <button type="button" className="gov-action-btn ghost small" onClick={cancel}>
                Cancel
              </button>
              <button type="submit" className="gov-action-btn primary small">
                Continue to sign
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'signing' && (
        <ElectronicSignatureGate
          action={action}
          meaning={meaning}
          recordId={recordId}
          recordType={recordType}
          immediate
          onSuccess={handleSigned}
          onCancel={cancel}
          context={reason}
        />
      )}
    </>
  );
}
