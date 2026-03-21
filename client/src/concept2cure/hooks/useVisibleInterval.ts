/**
 * Returns a `refetchInterval` value that pauses polling when the tab is hidden.
 *
 * Usage:
 *   const interval = useVisibleInterval(30_000);
 *   useQuery({ queryKey: [...], refetchInterval: interval });
 *
 * When the tab is in the background, the interval returns `false`,
 * which tells TanStack Query to pause automatic refetching.
 */

import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}

function getSnapshot() {
  return document.visibilityState === 'visible';
}

function getServerSnapshot() {
  return true;
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns `ms` when the page is visible, `false` when hidden.
 * Pass the return value directly to `refetchInterval`.
 */
export function useVisibleInterval(ms: number): number | false {
  const visible = usePageVisible();
  return visible ? ms : false;
}
