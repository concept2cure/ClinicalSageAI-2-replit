/**
 * Where a menu opened from a button goes, as fixed coordinates, so no
 * ancestor's overflow can clip it.
 *
 * The front door's composer rounds its corners with overflow:hidden, and a
 * menu positioned inside it was cut off with its items unclickable. That was
 * fixed for the Live Drive menu inline (LiveDriveSwitch), and the engine menu
 * beside it kept the bug (end-to-end finding F3). One placement now serves
 * both: above the button when there is room, else below; aligned to the
 * button's left or right edge.
 */
import type React from 'react';

export function fixedMenuPlacement(
  button: HTMLElement | null,
  opts: { roomPx: number; align?: 'left' | 'right' },
): React.CSSProperties {
  const r = button?.getBoundingClientRect();
  if (!r) return {};
  const horizontal =
    opts.align === 'right'
      ? { right: window.innerWidth - r.right, left: 'auto' as const }
      : { left: r.left, right: 'auto' as const };
  return r.top > opts.roomPx
    ? { position: 'fixed', ...horizontal, bottom: window.innerHeight - r.top + 6, top: 'auto' }
    : { position: 'fixed', ...horizontal, top: r.bottom + 6, bottom: 'auto' };
}
