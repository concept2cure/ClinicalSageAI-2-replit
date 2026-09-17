import { useEffect, useRef } from 'react';

/**
 * Dialog behaviour shared by the v2 modals: focus the panel on open, keep Tab
 * inside it, close on Escape, restore focus to the opener on unmount. Callers
 * put role="dialog" aria-modal="true" tabIndex={-1} and this ref on the panel.
 *
 * It used to say, in this header, that it was "not a full focus trap — Tab can
 * leave the panel". That is the one part of the contract a caller cannot work
 * around, and `aria-modal="true"` is a promise that it does not happen: a
 * screen reader hides everything outside the dialog on the strength of it, so a
 * keyboard user who tabs past the last control lands on a control that has been
 * removed from their accessibility tree, behind an opaque backdrop, with no way
 * to tell where they are. With 36 call sites the fix belongs here and nowhere
 * else.
 *
 * Tab from the last control wraps to the first, Shift+Tab from the first wraps
 * to the last, and focus that has escaped by any other route is pulled back.
 * A panel with nothing focusable in it keeps focus on the panel.
 */

/* Deliberately not filtered on visibility: `offsetParent` is null for every
   element in jsdom, so a visibility filter would make this a no-op under test
   while appearing to work. Disabled and inert controls are excluded because
   the browser will not focus them either way. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true'
  );
}

export function useDialog(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = ref.current;
      if (!panel) return;

      const items = focusable(panel);
      if (items.length === 0) {
        // Nothing to move to; hold focus on the panel rather than letting it
        // fall through to the page behind the backdrop.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (active && !panel.contains(active)) {
        // Focus is already outside — whatever put it there, bring it back.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return ref;
}
