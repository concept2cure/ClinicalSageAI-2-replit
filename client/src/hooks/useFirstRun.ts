import { useEffect, useState } from 'react';

/**
 * First-run detector using localStorage.
 * Scope keys:
 *  - globalKey: e.g., 'stability.firstRun.global'
 *  - optional per-entity key: e.g., `stability.firstRun.study.<studyId>`
 */
export default function useFirstRun(globalKey: string, entityKey?: string) {
  const gk = globalKey;
  const ek = entityKey ? `${globalKey}.${entityKey}` : undefined;

  const [isFirst, setIsFirst] = useState<boolean>(false);

  useEffect(() => {
    try {
      const g = localStorage.getItem(gk);
      const e = ek ? localStorage.getItem(ek) : '1'; // if no per-entity key, treat as first until global seen
      if (!g || (ek && !e)) setIsFirst(true);
    } catch {
      /* ignore */
    }
  }, [gk, ek]);

  function markSeen() {
    try {
      localStorage.setItem(gk, '1');
      if (ek) localStorage.setItem(ek, '1');
      setIsFirst(false);
    } catch {
      /* ignore */
    }
  }

  function reset() {
    try {
      localStorage.removeItem(gk);
      if (ek) localStorage.removeItem(ek);
      setIsFirst(true);
    } catch {
      /* ignore */
    }
  }

  return { isFirst, markSeen, reset };
}
