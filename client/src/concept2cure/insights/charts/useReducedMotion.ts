import { useEffect, useState } from 'react';

/**
 * Reports whether the user has requested reduced motion.
 *
 * Charts pass the negation of this into recharts' `isAnimationActive` so that
 * `prefers-reduced-motion: reduce` removes chart entrance animation entirely,
 * per README "Animation & motion" and the motion-discipline contract.
 *
 * SSR / non-browser safe: defaults to `true` (no animation) until a real
 * `matchMedia` result is available, so server renders stay still.
 */
export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';

  const getInitial = (): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia(query).matches;
  };

  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(getInitial);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => {
      mediaQuery.removeEventListener('change', onChange);
    };
  }, []);

  return prefersReducedMotion;
}
