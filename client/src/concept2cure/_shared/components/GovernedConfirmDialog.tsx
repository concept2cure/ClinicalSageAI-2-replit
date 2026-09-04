/**
 * <GovernedConfirmDialog> — the canonical shared reason-for-change modal.
 *
 * Promoted from the retired pdev-local twin per the audit's high-value
 * item #11 ("every governed mutation should use it; today most kits
 * reinvent modals"). Icon- and CSS-class-agnostic (inline SVG + inline
 * styles fed by canonical tokens) so it drops into any kit without
 * dragging kit-scoped stylesheets along. All five PDEV governed-action
 * call sites now import from here; the pdev-local ConfirmDialog.tsx has
 * been deleted.
 *
 * NAMING. Called `GovernedConfirmDialog` (not `ConfirmDialog`) so basename-
 * collision guards in the repo-health scan stay clean without needing a
 * baseline ratchet.
 *
 * WHEN TO USE THIS. Any client-side gate that captures a "reason for change"
 * before a governed mutation runs — state transitions, evidence attach/detach,
 * assembly compiles, approval-chain kickoffs. Enforces two floors:
 *   • Minimum reason length (default 10 chars; the assembly compile uses 30).
 *   • Typed confirm word (default 'yes'; destructive flows use a specific
 *     phrase like 'yes-transmit' so the user can't tab-through by accident).
 *
 * WHEN NOT TO USE THIS. If the action is a real §11.50 electronic signature,
 * use `<EsignModal>` in this same directory instead — it re-authenticates
 * against the server and records a real signature manifest. `ConfirmDialog`
 * only gates a mutation with a reason and a typed word; it does NOT sign.
 *
 * The existing kit-local `PdevConfirmDialog` (pdev/components/ConfirmDialog.tsx)
 * is a functional twin left in place until pdev's CSS is decoupled — a
 * follow-up refactor. Do not depend on that file from outside pdev.
 *
 * @module client/src/concept2cure/_shared/components/ConfirmDialog
 */
import * as React from 'react';
import { registerCeremonyOpen } from '../../v2/ceremony';
import './governed-confirm-dialog.css';

// ── Inline Lucide-style icons (stroke, currentColor) ─────────────────────────

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

const IconShield = () => (
  <Ico size={18}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </Ico>
);

const IconClose = () => (
  <Ico>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Ico>
);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmConfig {
  /** Human-readable action label, e.g. "Change activity state". */
  action: string;
  /** Specific target, e.g. "cmc.formulation_development · drafting → in_review". */
  target: string;
  /** Resource being acted on (usually an activity key, program code, or filing id). */
  resource?: string;
  /**
   * Minimum number of non-whitespace characters required in the reason field.
   * Defaults to 10. Use 30 for high-impact compile / transmit flows.
   */
  minReason?: number;
  /**
   * Word the user must type to confirm. Defaults to 'yes'. Destructive flows
   * (assembly compile, ESG transmit) use a specific phrase.
   */
  confirmWord?: string;
}

export interface ConfirmResult {
  reason: string;
  confirmedAt: string;
}

export interface ConfirmDialogProps extends ConfirmConfig {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: ConfirmResult) => void | Promise<void>;
  /**
   * Optional submission error to display in the dialog without closing it
   * (e.g. server-side rejection surfaced inline).
   */
  submitError?: string | null;
}

// ── Focus trap helper ────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function GovernedConfirmDialog({
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
  const modalRef = React.useRef<HTMLDivElement>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      setReason('');
      setConfirm('');
      setSubmitting(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open && restoreFocusRef.current) {
      restoreFocusRef.current.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  // The ceremony channel: unlike C2CForm this component stays mounted and
  // shows on `open`, so registration keys on the prop (see v2/ceremony.ts).
  React.useEffect(() => {
    if (!open) return undefined;
    return registerCeremonyOpen();
  }, [open]);

  // Esc closes + focus trap.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (submitting) return;
        e.stopPropagation();
        onCancel();
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
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const reasonCount = reason.trim().length;
  const reasonOk = reasonCount >= minReason;
  const confirmOk = confirm.trim() === confirmWord;
  const canSubmit = reasonOk && confirmOk && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
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
      className="c2c-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div ref={modalRef} className="c2c-confirm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="c2c-confirm-head">
          <span className="c2c-confirm-ic">
            <IconShield />
          </span>
          <div className="c2c-confirm-heading">
            <div className="c2c-confirm-kicker">Governed action · audit-logged</div>
            <div id={titleId} className="c2c-confirm-action">
              {action}
            </div>
            <div className="c2c-confirm-target">{target}</div>
          </div>
          <button
            type="button"
            className="c2c-confirm-x"
            onClick={onCancel}
            aria-label="Cancel"
            disabled={submitting}
          >
            <IconClose />
          </button>
        </div>

        {resource && (
          <div className="c2c-confirm-resource">
            <div className="c2c-confirm-resource-l">Resource</div>
            <div className="c2c-confirm-mono">{resource}</div>
          </div>
        )}

        <div>
          <label className="c2c-confirm-label">
            <span>Reason for this action</span>
            <span className="c2c-confirm-count" data-ok={reasonOk || undefined}>
              {reasonCount} / {minReason} min
            </span>
          </label>
          <textarea
            className="c2c-confirm-reason"
            rows={3}
            placeholder="Captured verbatim in the audit log. Be specific."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            aria-required="true"
          />
        </div>

        <div>
          <label className="c2c-confirm-label" data-block="">
            Type <span className="c2c-confirm-word">{confirmWord}</span> to confirm
          </label>
          <input
            className="c2c-confirm-input"
            type="text"
            placeholder={confirmWord}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-required="true"
            autoComplete="off"
          />
        </div>

        {submitError && (
          <div role="alert" className="c2c-confirm-error">
            {submitError}
          </div>
        )}

        <div className="c2c-confirm-acts">
          <button type="button" className="c2c-confirm-btn" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="c2c-confirm-btn pri" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Logging audit…' : (<><IconShield /> Confirm and log</>)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GovernedConfirmDialog;
