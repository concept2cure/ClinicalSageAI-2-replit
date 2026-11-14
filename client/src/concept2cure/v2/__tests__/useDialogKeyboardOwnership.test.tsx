// @vitest-environment jsdom
/** A dialog must not discard a draft for keys still owned by its input. */
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useDialog } from '../useDialog';

afterEach(cleanup);

function DraftDialog({ name = 'Message', handled, onClose }: {
  name?: string; handled?: string; onClose: () => void;
}) {
  const ref = useDialog(onClose);
  const [draft, setDraft] = useState('Keep this unsent draft');
  return <div role="dialog" aria-modal="true" aria-label={name} tabIndex={-1} ref={ref}
    onKeyDown={event => { if (event.key === handled) event.preventDefault(); }}>
    <textarea aria-label={`${name} draft`} value={draft} onChange={event => setDraft(event.target.value)} />
    <button type="button">First action</button><button type="button">Last action</button>
  </div>;
}

function DraftHarness({ handled }: { handled?: string }) {
  const [open, setOpen] = useState(true);
  return open ? <DraftDialog handled={handled} onClose={() => setOpen(false)} /> : null;
}

function key(target: Element, value: string, isComposing = false) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, isComposing });
  fireEvent(target, event);
  return event;
}
const draft = (name = 'Message') => screen.getByRole('textbox', { name: `${name} draft` }) as HTMLTextAreaElement;

describe('dialog keys owned by text entry', () => {
  it('preserves the draft when native Escape is still composing input', () => {
    render(<DraftHarness />); const field = draft(); field.focus();
    fireEvent.compositionStart(field);
    const event = key(field, 'Escape', true);
    expect(event.isComposing).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(draft().value).toBe('Keep this unsent draft');
    expect(document.activeElement).toBe(field);
  });

  it('preserves the draft when its descendant handles Escape without stopping propagation', () => {
    render(<DraftHarness handled="Escape" />); const field = draft(); field.focus();
    const event = key(field, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(draft().value).toBe('Keep this unsent draft');
    expect(document.activeElement).toBe(field);
  });

  it('leaves an already-handled Tab with its local control', () => {
    render(<DraftHarness handled="Tab" />);
    const last = screen.getByRole('button', { name: 'Last action' }); last.focus();
    expect(key(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('lets a normal Escape close the draft after composition has ended', () => {
    render(<DraftHarness />); const field = draft(); field.focus();
    fireEvent.compositionStart(field); key(field, 'Escape', true);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.compositionEnd(field); key(field, 'Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not deliver composing Escape to either layer in a dialog stack', () => {
    const lower = vi.fn(), top = vi.fn();
    render(<><DraftDialog name="Lower" onClose={lower} /><DraftDialog name="Top" onClose={top} /></>);
    key(draft('Top'), 'Escape', true);
    expect(top).not.toHaveBeenCalled(); expect(lower).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
  });
});

describe('ordinary dialog keyboard controls remain available', () => {
  it('closes for an ordinary unhandled Escape', () => {
    render(<DraftHarness />); key(draft(), 'Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('still traps an ordinary Tab from the last action to the draft', () => {
    render(<DraftHarness />);
    const last = screen.getByRole('button', { name: 'Last action' }); last.focus();
    expect(key(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(draft());
  });

  it('keeps ordinary typing and noncomposing keys in the draft', () => {
    render(<DraftHarness />); const field = draft(); field.focus();
    fireEvent.change(field, { target: { value: 'A distinct unsent follow-up' } });
    key(field, 'a'); key(field, 'Enter');
    expect(draft().value).toBe('A distinct unsent follow-up');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('sends normal Escape only to the topmost layer', () => {
    const lower = vi.fn(), top = vi.fn();
    render(<><DraftDialog name="Lower" onClose={lower} /><DraftDialog name="Top" onClose={top} /></>);
    key(draft('Top'), 'Escape');
    expect(top).toHaveBeenCalledOnce(); expect(lower).not.toHaveBeenCalled();
  });

  it('uses the current close callback after a rerender', () => {
    const oldClose = vi.fn(), currentClose = vi.fn();
    const view = render(<DraftDialog onClose={oldClose} />);
    view.rerender(<DraftDialog onClose={currentClose} />); key(draft(), 'Escape');
    expect(currentClose).toHaveBeenCalledOnce(); expect(oldClose).not.toHaveBeenCalled();
  });

  it('can close normally after its local Escape handler is retired', () => {
    const view = render(<DraftHarness handled="Escape" />);
    view.rerender(<DraftHarness />); key(draft(), 'Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
