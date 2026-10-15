import { useEffect, useRef, useState, type RefObject } from 'react';

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
