/**
 * A 1 Hz clock while something is in flight; frozen otherwise.
 *
 * One implementation for every elapsed-time display (the work dock, the
 * transcript's activity record). Ticking only while `active` is what keeps a
 * settled turn's duration from drifting after the fact: the callers read a
 * recorded end once they have one, and this stops re-rendering them.
 *
 * @module client/src/concept2cure/v2/useNow
 */

import React from 'react';

export function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
