// LabelingDialog — accessible modal shell for labeling authoring forms.
//
// Mirrors the CmcDialog / EsignModal a11y contract exactly: role="dialog"
// aria-modal, labelled by the title, focus trapped inside, focus returned to
// the trigger on close, Esc closes (unless a mutation is committing). Form
// fields and the footer are supplied by the caller; this owns only the chrome
// and focus behaviour.
//
// Mirrored locally rather than promoted to _shared because the CmcDialog chrome
// is styled by .cmc-dialog-* rules that live in cmc/app.css and bind to
// CmcIcon. Promoting would force a CSS relocation plus an icon re-wire across
// the working CMC surfaces — broader risk than the brief's DRY benefit. This
// uses .lb-dialog-* tokens-only rules added to labeling/app.css and LabelingIcon.

import * as React from 'react';
import { LabelingIcon } from '../icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface LabelingDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** When true, Esc and the overlay are inert (a mutation is in flight). */
  busy?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Footer actions, right-aligned. */
  footer: React.ReactNode;
}

export function LabelingDialog({ open, title, subtitle, busy = false, onClose, children, footer }: LabelingDialogProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const subId = React.useId();
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  // Capture the trigger so focus returns to it on close.
  React.useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  // Initial focus into the dialog.
  React.useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (!node) return;
    const first = node.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [open]);

  // Esc + focus trap.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, busy, onClose]);

  // Return focus on unmount/close.
  React.useEffect(() => {
    if (open) return;
    const target = returnFocusRef.current;
    if (target && typeof target.focus === 'function') target.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="lb-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="lb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subId : undefined}
      >
        <div className="lb-dialog-head">
          <div>
            <h2 className="lb-dialog-title" id={titleId}>{title}</h2>
            {subtitle && <p className="lb-dialog-sub" id={subId}>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="lb-dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <LabelingIcon name="x" />
          </button>
        </div>
        <div className="lb-dialog-body">{children}</div>
        <div className="lb-dialog-foot">{footer}</div>
      </div>
    </div>
  );
}
