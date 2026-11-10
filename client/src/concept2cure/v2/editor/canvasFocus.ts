import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type RefObject } from 'react';
import { escapeBelongsToInner, outlineOverlays } from './DocumentWorkbench';

/** The existing section-open nonce serves both a saved arrival and a clicked draft. */
export function useOriginSectionFocus(sectionId?: string) {
  const [focusSection, setFocusSection] = useState<{ id: string; nonce: number } | null>(
    () => sectionId ? { id: sectionId, nonce: 1 } : null,
  );
  const applied = useRef(sectionId);
  useEffect(() => {
    if (!sectionId || applied.current === sectionId) return;
    applied.current = sectionId;
    setFocusSection(previous => ({ id: sectionId, nonce: (previous?.nonce ?? 0) + 1 }));
  }, [sectionId]);
  return [focusSection, setFocusSection] as const;
}

/** The existing canvas focus contract, including an asynchronous origin open. */
export function useCanvasRegionFocus({ expanded, cardless, returnFocus, focusOnOpen, mounted, recordReady, back, card }: {
  expanded: boolean; cardless: boolean; returnFocus: boolean; focusOnOpen: boolean;
  mounted: boolean; recordReady: boolean;
  back: RefObject<HTMLButtonElement | null>; card: RefObject<HTMLButtonElement | null>;
}) {
  const wasExpanded = useRef(cardless ? false : expanded);
  const hasOpened = useRef(false);
  const toList = useRef(false);
  useEffect(() => {
    if (expanded) {
      const button = back.current;
      if (!button) return;
      // An arrival can prefill the composer while its record loads. Its
      // first asynchronous expansion leaves the typing focus there; later
      // explicit opens retain the canvas's established focus behavior.
      if (!wasExpanded.current && (focusOnOpen || hasOpened.current)) button.focus({ preventScroll: true });
      hasOpened.current = true;
      wasExpanded.current = true;
      return;
    }
    if (wasExpanded.current && returnFocus && !toList.current) card.current?.focus({ preventScroll: true });
    toList.current = false;
    wasExpanded.current = false;
  }, [expanded, mounted, recordReady, returnFocus, focusOnOpen, back, card]);
  return toList;
}

/**
 * Whether the workbench inside the canvas closes something on this Escape first, so the canvas must not collapse.
 * 2026-09-28 (GA-4): an open workbench rail other than AnA closes on this Escape first (DocumentWorkbench's own
 * listener); the canvas collapses on the next one. Both listen on the document, so the order they run in is not
 * something to rely on: the canvas yields for the Escapes the workbench takes, from inside it or from the body. One
 * from the canvas's own bar is still the canvas's. D4-4: an outline floating over the page is closed first the same way.
 */
function workbenchTakesEscape(region: HTMLElement | null, target: KeyboardEvent['target']): boolean {
  /* The bar's own close (D4-5) sits inside the workbench, and an Escape from it is still the canvas's. */
  if (target instanceof Element && target.closest('[data-host-close]')) return false;
  const within = (el: Element | null | undefined) =>
    !!el && (target === document.body || (target instanceof Node && el.contains(target)));
  if (within(region?.querySelector('.ed[data-rail]:not([data-rail="ana"])'))) return true;
  const ed = region?.querySelector('.ed');
  return !!ed && outlineOverlays(ed) && within(ed);
}

/**
 * D4-5: until the record is read the canvas draws a placeholder bar, and the editor's one bar replaces it when it
 * arrives. Focus on the placeholder's close moves to the editor's close instead of dropping to the page. Spread the
 * returned handlers on the placeholder's close; `close` is the ref both closes share.
 */
export function useCloseFocusHandoff(arrived: boolean, close: RefObject<HTMLButtonElement | null>) {
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (!arrived || !focused.current) return;
    focused.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) close.current?.focus({ preventScroll: true });
  }, [arrived, close]);
  return {
    onFocus: () => { focused.current = true; },
    onBlur: (e: FocusEvent<HTMLButtonElement>) => { if (e.currentTarget.isConnected) focused.current = false; },
  };
}

/** Keep the existing canvas Escape ownership beside its focus behavior. */
export function useCanvasEscape({ expanded, expandedRef, rootRef, onExpandedChange }: {
  expanded: boolean; expandedRef: RefObject<HTMLElement | null>; rootRef: RefObject<HTMLElement | null>;
  onExpandedChange: (expanded: boolean) => void;
}) {
  /* Escape collapses, from anywhere the key is not already owned by something
     inside; focus returns to the header control that expands.

     The listener is on the DOCUMENT, not on the canvas element. Bound to the
     element it only ever saw a keydown that bubbled from a descendant, so
     Escape worked while a control inside the editor held focus and did
     nothing the moment focus was on the body — which is where focus sits
     after a click on any non-focusable chrome. The way out of a region that
     fills the conversation was then the mouse alone. Only the expanded canvas
     binds it (`expanded` gates the effect) and the thread expands one at a
     time, so two canvases never both answer the key. */
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (escapeBelongsToInner(e.target)) return;
      if (workbenchTakesEscape(expandedRef.current ?? rootRef.current, e.target)) return;
      /* An open modal owns Escape wherever focus happens to be — closing the
         canvas underneath it would leave the dialog over a collapsed card. */
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      onExpandedChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, onExpandedChange, expandedRef, rootRef]);

}
