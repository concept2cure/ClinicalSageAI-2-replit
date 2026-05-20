/**
 * useClickOutside — close a dropdown when the user clicks anywhere
 * outside its ref'd container element.
 *
 * Returns a stable ref to attach to the dropdown root. The hook
 * registers a `mousedown` listener only while `isOpen` is true so the
 * cost is zero for closed dropdowns.
 *
 * Pulled out as a shared hook during the AnaPersistentPanel split —
 * the panel previously inlined the same useEffect three times for
 * three different dropdowns.
 *
 * @module client/src/concept2cure/hooks/useClickOutside
 */

import { useEffect, useRef } from 'react';

export function useClickOutside<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose: () => void,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen, onClose]);

  return ref;
}

export default useClickOutside;
