/**
 * Whether AnA's progress dock is shown — one memory, shared by every host.
 *
 * The rail, the conversation surface and the owned authoring panes each mount
 * the same dock; a person who hides it in one place has said what they want
 * everywhere, so the choice lives under one key rather than one per host.
 * Shown by default: a client who asked AnA to do something should see her
 * doing it without hunting for a switch. Remembered per browser, never per
 * turn.
 *
 * @module client/src/concept2cure/v2/workDock
 */

import React from 'react';

/** Per-browser memory of whether the work dock is shown. */
export const WORK_DOCK_KEY = 'c2c-v2-ana-work-dock';

function readStored(): boolean {
  try {
    return localStorage.getItem(WORK_DOCK_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

function useWorkDockVisible(): [boolean, (v: boolean) => void] {
  const [shown, setShown] = React.useState<boolean>(readStored);
  const set = React.useCallback((v: boolean) => {
    setShown(v);
    try {
      localStorage.setItem(WORK_DOCK_KEY, v ? 'shown' : 'hidden');
    } catch {
      /* session-only */
    }
  }, []);
  return [shown, set];
}

/**
 * The progress dock as every host drives it: the shared show/hide memory, the
 * chip that toggles it, the id the chip names as what it controls, and a close
 * that hands focus back to that chip. The
 * panel's own close control lives INSIDE the panel, so closing it unmounts the
 * control that had focus; without the hand-back the browser drops focus to
 * <body>. Not on mount — a remembered "hidden" must not steal focus.
 */
export function useProgressDock(): {
  open: boolean;
  toggle: () => void;
  close: () => void;
  chipRef: React.RefObject<HTMLButtonElement | null>;
  /** Put on the element the chip reveals; the chip's aria-controls names it. */
  panelId: string;
} {
  const [open, setOpen] = useWorkDockVisible();
  const panelId = React.useId();
  const chipRef = React.useRef<HTMLButtonElement>(null);
  const refocus = React.useRef(false);
  const close = React.useCallback(() => {
    refocus.current = true;
    setOpen(false);
  }, [setOpen]);
  const toggle = React.useCallback(() => setOpen(!open), [open, setOpen]);
  React.useEffect(() => {
    if (!open && refocus.current) {
      refocus.current = false;
      chipRef.current?.focus();
    }
  }, [open]);
  return { open, toggle, close, chipRef, panelId };
}
