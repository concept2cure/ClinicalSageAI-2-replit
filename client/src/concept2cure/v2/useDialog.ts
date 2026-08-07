import { useEffect, useRef } from 'react';

/**
 * Minimal dialog behaviour shared by the v2 modals: focus the panel on open,
 * close on Escape, restore focus to the opener on unmount. Callers put
 * role="dialog" aria-modal="true" tabIndex={-1} and this ref on the panel.
 *
 * Not a full focus trap — Tab can leave the panel — but it closes the two
 * WCAG gaps every v2 modal shipped with: no keyboard exit and no focus
 * hand-off (assessment D31).
 */
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
