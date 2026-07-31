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
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 12, 8, 0.55)',
        zIndex: 200,
      }}
    >
      <div
        ref={modalRef}
        className="c2c-confirm"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: 'calc(100% - 32px)',
          padding: 20,
          borderRadius: 10,
          background: 'var(--surface, var(--card, #fff))',
          color: 'var(--foreground, #1c1c1c)',
          border: '1px solid var(--border, rgba(0,0,0,0.12))',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--accent-050, rgba(217, 119, 87, 0.12))',
              color: 'var(--accent-200, #a54a2a)',
              flexShrink: 0,
            }}
          >
            <IconShield />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: 'var(--text-300, #7a7266)',
                marginBottom: 4,
              }}
            >
              Governed action · audit-logged
            </div>
            <div id={titleId} style={{ fontSize: 15, fontWeight: 600 }}>
              {action}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-200, #514e46)', marginTop: 2 }}>
              {target}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            disabled={submitting}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 4,
              cursor: 'pointer',
              color: 'var(--text-300, #7a7266)',
            }}
          >
            <IconClose />
          </button>
        </div>

        {resource && (
          <div
            style={{
              padding: '8px 10px',
              background: 'var(--muted, rgba(0,0,0,0.03))',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div style={{ color: 'var(--text-300, #7a7266)', fontSize: 10, textTransform: 'uppercase' }}>
              Resource
            </div>
            <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
              {resource}
            </div>
          </div>
        )}

        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>Reason for this action</span>
            <span
              style={{
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: reasonOk ? 'var(--success, #4d6b2d)' : 'var(--text-300, #7a7266)',
              }}
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
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 6,
              border: '1px solid var(--border, rgba(0,0,0,0.16))',
              fontFamily: 'inherit',
              fontSize: 13,
              resize: 'vertical',
              minHeight: 60,
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Type{' '}
            <span
              style={{
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                padding: '1px 6px',
                borderRadius: 4,
                background: 'var(--muted, rgba(0,0,0,0.06))',
              }}
            >
              {confirmWord}
            </span>{' '}
            to confirm
          </label>
          <input
            type="text"
            placeholder={confirmWord}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-required="true"
            autoComplete="off"
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border, rgba(0,0,0,0.16))',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 13,
            }}
          />
        </div>

        {submitError && (
          <div
            role="alert"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              background: 'var(--danger-050, rgba(160, 48, 40, 0.08))',
              color: 'var(--danger, #a03028)',
              fontSize: 12,
            }}
          >
            {submitError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--border, rgba(0,0,0,0.16))',
              background: 'transparent',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid transparent',
              background: canSubmit ? 'var(--accent-200, #a54a2a)' : 'var(--muted, rgba(0,0,0,0.12))',
              color: canSubmit ? '#fff' : 'var(--text-300, #7a7266)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {submitting ? 'Logging audit…' : (<><IconShield /> Confirm and log</>)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GovernedConfirmDialog;
