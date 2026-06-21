/**
 * Governed-action confirmation dialog — captures a mandatory reason-for-change
 * before a status mutation, per the platform's 21 CFR Part 11 posture. The
 * server independently enforces the reason; this is the UX half.
 */

import * as React from 'react';

export interface GovernedActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function GovernedActionDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  busy,
  error,
  onConfirm,
  onCancel,
}: GovernedActionDialogProps) {
  const [reason, setReason] = React.useState('');
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      setReason('');
      // Focus the reason field on open for keyboard users.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const canConfirm = reason.trim().length >= 3 && !busy;

  return (
    <div className="ma-modal-scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ma-modal">
        <div className="ma-modal-title">{title}</div>
        <p className="ma-modal-desc">{description}</p>
        <label className="ma-field-label" htmlFor="ma-reason">
          Reason for change <span className="ma-req">required</span>
        </label>
        <textarea
          id="ma-reason"
          ref={inputRef}
          className="ma-textarea"
          rows={3}
          value={reason}
          placeholder="Recorded to the audit trail (min 3 characters)…"
          onChange={e => setReason(e.target.value)}
          disabled={busy}
        />
        {error && <div className="ma-modal-error">{error}</div>}
        <div className="ma-modal-actions">
          <button className="ma-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={`ma-btn ${destructive ? 'ma-btn-danger' : 'ma-btn-primary'}`}
            onClick={() => onConfirm(reason.trim())}
            disabled={!canConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
