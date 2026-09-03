/**
 * Whether the "AnA at work" dock is shown — one memory, shared by every host.
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

export function useWorkDockVisible(): [boolean, (v: boolean) => void] {
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
