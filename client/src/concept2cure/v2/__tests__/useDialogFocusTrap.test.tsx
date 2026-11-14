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

function FocusLayer({ name, enabled = true, opener = true }: { name: string; enabled?: boolean; opener?: boolean }) {
  const ref = useDialog(() => {}, enabled);
  return enabled ? <div role="dialog" aria-label={name} aria-modal="true" tabIndex={-1} ref={ref}>
    {opener && <button>{name} opener</button>}
    <input aria-label={`${name} draft`} />
  </div> : null;
}

function FocusStack({ lower = false, upper = false, enabled = true, opener = true }: {
  lower?: boolean; upper?: boolean; enabled?: boolean; opener?: boolean;
}) {
  return <>
    <button>page opener</button>
    {lower && <FocusLayer key="lower" name="Lower" enabled={enabled} opener={opener} />}
    {upper && <FocusLayer key="upper" name="Upper" />}
  </>;
}

function openLower(strict = false) {
  const wrap = (contents: React.ReactNode) => strict ? <React.StrictMode>{contents}</React.StrictMode> : contents;
  const view = render(wrap(<FocusStack />));
  const pageOpener = screen.getByRole('button', { name: 'page opener' }); pageOpener.focus();
  view.rerender(wrap(<FocusStack lower />));
  return { view, pageOpener, wrap };
}

describe('dialog cleanup respects the remaining open layer', () => {
  it.each(['unmounted', 'disabled'])('keeps focus in the higher dialog when the lower one is %s', change => {
    const { view } = openLower();
    screen.getByRole('button', { name: 'Lower opener' }).focus();
    view.rerender(<FocusStack lower upper />);
    const draft = screen.getByRole('textbox', { name: 'Upper draft' }); draft.focus();
    view.rerender(<FocusStack lower={change !== 'unmounted'} enabled={change !== 'disabled'} upper />);
    expect(document.activeElement).toBe(draft);
    expect(screen.getByRole('dialog', { name: 'Upper' }).contains(document.activeElement)).toBe(true);
  });

  it('returns focus to the remaining lower dialog when the upper opener was removed', () => {
    const { view } = openLower();
    screen.getByRole('button', { name: 'Lower opener' }).focus();
    view.rerender(<FocusStack lower upper />);
    screen.getByRole('textbox', { name: 'Upper draft' }).focus();
    view.rerender(<FocusStack lower upper opener={false} />);
    view.rerender(<FocusStack lower opener={false} />);
    expect(screen.getByRole('dialog', { name: 'Lower' }).contains(document.activeElement)).toBe(true);
  });

  it('restores the connected opener inside the lower dialog when its top layer closes', () => {
    const { view } = openLower();
    const opener = screen.getByRole('button', { name: 'Lower opener' }); opener.focus();
    view.rerender(<FocusStack lower upper />);
    screen.getByRole('textbox', { name: 'Upper draft' }).focus();
    view.rerender(<FocusStack lower />);
    expect(document.activeElement).toBe(opener);
  });

  it('restores the page opener when the only enabled dialog is disabled', () => {
    const { view, pageOpener } = openLower();
    view.rerender(<FocusStack lower enabled={false} />);
    expect(document.activeElement).toBe(pageOpener);
  });

  it('restores the surviving page opener when the whole stack is removed together', () => {
    const { view, pageOpener } = openLower();
    screen.getByRole('button', { name: 'Lower opener' }).focus();
    view.rerender(<FocusStack lower upper />);
    view.rerender(<FocusStack />);
    expect(document.activeElement).toBe(pageOpener);
  });

  it('retains the surviving page opener after its lower dialog was retired first', () => {
    const { view, pageOpener } = openLower();
    screen.getByRole('button', { name: 'Lower opener' }).focus();
    view.rerender(<FocusStack lower upper />);
    view.rerender(<FocusStack upper />);
    screen.getByRole('textbox', { name: 'Upper draft' }).focus();
    view.rerender(<FocusStack />);
    expect(document.activeElement).toBe(pageOpener);
  });

  it('keeps ordinary nested opener restoration in StrictMode', () => {
    const { view, pageOpener, wrap } = openLower(true);
    const opener = screen.getByRole('button', { name: 'Lower opener' }); opener.focus();
    view.rerender(wrap(<FocusStack lower upper />));
    view.rerender(wrap(<FocusStack lower />));
    expect(document.activeElement).toBe(opener);
    view.rerender(wrap(<FocusStack />));
    expect(document.activeElement).toBe(pageOpener);
  });
});

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

  /* Quality review, 2026-11-10: the review route keeps its panel open beneath a reason sheet (Return for revision,
     Reassign, Add a reviewer). Each dialog listened on the document, so one Escape closed both, and each Tab was pulled
     back and forth between them until it could reach neither's controls. Only the topmost open dialog answers. */
  it('lets only the topmost of two open dialogs answer Escape and Tab', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    function Inner({ onClose }: { onClose: () => void }) {
      const ref = useDialog(onClose);
      return (
        <div role="dialog" aria-modal="true" aria-label="Inner" tabIndex={-1} ref={ref}>
          <button>inner first</button>
          <button>inner last</button>
        </div>
      );
    }
    const { rerender } = render(<><Panel onClose={outer} /></>);
    rerender(<><Panel onClose={outer} /><Inner onClose={inner} /></>);
    const last = screen.getByRole('button', { name: 'inner last' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'inner first' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    // With the inner one closed, the outer one answers again.
    rerender(<><Panel onClose={outer} /></>);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
