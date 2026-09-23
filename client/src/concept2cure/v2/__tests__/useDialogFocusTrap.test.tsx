// @vitest-environment jsdom
/**
 * `aria-modal="true"` is a promise, and useDialog was not keeping it.
 *
 * Its own header used to say "not a full focus trap — Tab can leave the panel",
 * as a documented limitation. But every v2 modal sets aria-modal="true" on the
 * strength of this hook, and that attribute tells a screen reader to hide
 * everything outside the dialog. So a keyboard user tabbing past the last
 * control landed on a control that had been removed from their accessibility
 * tree, behind an opaque backdrop, with no way to tell where focus had gone.
 * That is not a limitation a caller can work around; with 36 call sites it
 * could only be fixed in the hook.
 *
 * Tested at the hook rather than through a surface, because that is the level
 * the guarantee lives at — a per-surface test would prove it for one modal and
 * leave the other thirty-five unexamined.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useDialog } from '../useDialog';

afterEach(() => cleanup());

function Panel({ onClose, empty = false }: { onClose: () => void; empty?: boolean }) {
  const ref = useDialog(onClose);
  return (
    <div role="dialog" aria-modal="true" aria-label="Test" tabIndex={-1} ref={ref}>
      {empty ? (
        <p>nothing focusable here</p>
      ) : (
        <>
          <button>first</button>
          <input aria-label="middle" />
          <button disabled>skipped</button>
          <button>last</button>
        </>
      )}
    </div>
  );
}

function Harness({ empty = false }: { empty?: boolean }) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <button data-testid="outside">outside the dialog</button>
      {open && <Panel onClose={() => setOpen(false)} empty={empty} />}
    </>
  );
}

const first = () => screen.getByRole('button', { name: 'first' });
const last = () => screen.getByRole('button', { name: 'last' });

describe('useDialog keeps Tab inside the panel', () => {
  it('wraps forward from the last control to the first', () => {
    render(<Harness />);
    last().focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first());
  });

  it('wraps backward from the first control to the last', () => {
    render(<Harness />);
    first().focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last());
  });

  it('pulls focus back when it has escaped the panel', () => {
    render(<Harness />);
    screen.getByTestId('outside').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first());
  });

  it('leaves interior Tab steps alone, so the trap is not a cage', () => {
    render(<Harness />);
    first().focus();
    // Not the last control, so the browser's own sequential navigation runs and
    // the hook must NOT preventDefault or move focus itself.
    const moved = fireEvent.keyDown(document, { key: 'Tab' });
    expect(moved).toBe(true);            // not defaultPrevented
    expect(document.activeElement).toBe(first());
  });

  it('holds focus on the panel when nothing inside is focusable', () => {
    render(<Harness empty />);
    const panel = screen.getByRole('dialog');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(panel);
  });

  it('still closes on Escape, and restores focus to the opener', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    render(<Harness />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
