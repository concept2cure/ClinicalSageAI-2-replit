/**
 * ReasonModal — lightweight prompt-replacement for governed actions that
 * require a reason string (10+ chars, recorded in the audit log).
 *
 * Optionally accepts an extra `emailField` label to collect a target
 * email address (used by the project-transfer flow).
 *
 * Reuses parch-* CSS already present in projects-prototype.css.
 */
import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  title: string;
  /** Body copy shown above the inputs. */
  description?: string;
  /** When set, renders an email input before the reason field. */
  emailLabel?: string;
  cta?: string;
  onClose: () => void;
  onConfirm: (reason: string, email?: string) => void;
}

export function ReasonModal({
  open, title, description, emailLabel, cta = 'Confirm', onClose, onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (open) { setReason(''); setEmail(''); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const emailOk = !emailLabel || email.trim().includes('@');
  const canConfirm = emailOk && reason.trim().length >= 10;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(reason.trim(), emailLabel ? email.trim() : undefined);
  };

  return (
    <div className="parch" role="dialog" aria-label={title}>
      <div className="parch-scrim" onClick={onClose} />
      <div className="parch-shell">
        <header className="parch-head">
          <h2 className="parch-title">{title}</h2>
        </header>
        <div className="parch-body">
          {description && <p className="parch-p">{description}</p>}
          {emailLabel && (
            <div className="parch-confirm">
              <label className="parch-confirm-lbl">{emailLabel}</label>
              <input
                className="parch-confirm-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                autoFocus
              />
            </div>
          )}
          <div className="parch-confirm">
            <label className="parch-confirm-lbl">
              Reason <span className="parch-confirm-target">(10+ characters, recorded in audit log)</span>
            </label>
            <input
              className="parch-confirm-input"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe why this action is being taken…"
              autoFocus={!emailLabel}
              onKeyDown={e => { if (e.key === 'Enter' && canConfirm) handleConfirm(); }}
            />
          </div>
        </div>
        <footer className="parch-foot">
          <button type="button" className="prj-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="prj-btn primary"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {cta}
          </button>
        </footer>
      </div>
    </div>
  );
}
