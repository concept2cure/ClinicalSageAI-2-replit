/**
 * PdevConfirmDialog — universal reason-for-change modal.
 *
 * Per PDEV_IND_DESIGN_BRIEF.md §2.12 / PHASE_7_INSTALL.md §6 Q5
 * (resolved): every governed mutation routes through this dialog with
 * live char count + minimum length displayed, plus a typed confirm word.
 * Server-side audit middleware writes the SHA-256 chain entry with the
 * reason text verbatim.
 *
 * Port basis: design-system/ui_kits/pdev/Confirm.jsx.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';

export interface ConfirmConfig {
  /** Human-readable action label, e.g. "Change activity state". */
  action: string;
  /** Specific target, e.g. "cmc.formulation_development · drafting → in_review". */
  target: string;
  /** Resource being acted on (kit shape — usually the activity key or program code). */
  resource?: string;
  /** Minimum number of non-whitespace characters required in the reason field.
   *  Defaults to 10. Use 30 for the IND assembly compile per the brief. */
  minReason?: number;
  /** Word the user must type to confirm. Defaults to 'yes'. The compile flow uses 'yes-transmit'. */
  confirmWord?: string;
}

interface ConfirmResult {
  reason: string;
  confirmedAt: string;
}

interface ConfirmDialogProps extends ConfirmConfig {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: ConfirmResult) => void | Promise<void>;
  /** Optional submission error to display in the dialog (e.g. server-side
   *  rejection) without closing the dialog. */
  submitError?: string | null;
}

export function PdevConfirmDialog({
  open,
  action,
  target,
  resource,
  minReason = 10,
  confirmWord = 'yes',
  onCancel,
  onConfirm,
  submitError,
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReason('');
      setConfirm('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const reasonCount = reason.trim().length;
  const reasonOk = reasonCount >= minReason;
  const confirmOk = confirm.trim() === confirmWord;
  const canSubmit = reasonOk && confirmOk && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      await onConfirm({
        reason: reason.trim(),
        confirmedAt: new Date().toISOString(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="pdev-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdev-confirm-title"
    >
      <div className="pdev-confirm">
        <div className="pdev-confirm-head">
          <span className="pdev-confirm-mark" aria-hidden="true">
            <PdevIcon name="shieldCheck" />
          </span>
          <div className="pdev-confirm-head-text">
            <div className="pdev-confirm-eyebrow">Governed action · audit-logged</div>
            <div className="pdev-confirm-title" id="pdev-confirm-title">
              {action}
            </div>
            <div className="pdev-confirm-target">{target}</div>
          </div>
          <button
            className="pdev-confirm-close"
            onClick={onCancel}
            type="button"
            aria-label="Cancel"
          >
            <PdevIcon name="close" />
          </button>
        </div>

        {resource && (
          <div className="pdev-confirm-resource">
            <div className="lbl">Resource</div>
            <div className="val">{resource}</div>
          </div>
        )}

        <div className="pdev-confirm-field">
          <label>
            <span className="pdev-confirm-label">Reason for this action</span>
            <span
              className={`pdev-confirm-count mono ${reasonOk ? 'ok' : 'low'}`}
            >
              {reasonCount} / {minReason} min
            </span>
          </label>
          <textarea
            rows={3}
            placeholder="Captured verbatim in the audit log. Be specific."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            aria-required="true"
          />
        </div>

        <div className="pdev-confirm-field">
          <label>
            <span className="pdev-confirm-label">
              Type <span className="mono pdev-confirm-word">{confirmWord}</span> to
              confirm
            </span>
          </label>
          <input
            className="pdev-confirm-input mono"
            placeholder={confirmWord}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-required="true"
            autoComplete="off"
          />
        </div>

        {submitError && (
          <div className="pdev-confirm-error" role="alert">
            {submitError}
          </div>
        )}

        <div className="pdev-confirm-foot">
          <button
            className="pdev-btn ghost"
            onClick={onCancel}
            disabled={submitting}
            type="button"
          >
            Cancel
          </button>
          <button
            className="pdev-btn primary"
            onClick={submit}
            disabled={!canSubmit}
            type="button"
          >
            {submitting ? (
              'Logging audit…'
            ) : (
              <>
                <PdevIcon name="shieldCheck" /> Confirm and log
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
