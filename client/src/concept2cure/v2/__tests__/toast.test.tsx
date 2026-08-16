// @vitest-environment jsdom
/**
 * <C2CToast> / useToast — the one transient acknowledgement channel.
 *
 * ── What these tests hold ────────────────────────────────────────────────────
 * Not "the toast renders its message". The property under test is the one that
 * failed in production twice: A FAILURE MUST NOT BE ANNOUNCED IN THE VOCABULARY
 * OF SUCCESS. `.de-toast .ico` is unconditionally green, so a toast that cannot
 * carry a tone reports "Export failed — HTTP 500" with the same tick as
 * "Published DOCX", and reported a REJECTED §11.50 signature PIN the same way.
 *
 * That is why the icon assertions below matter as much as the colour: WCAG 2.2
 * SC 1.4.1 — colour alone cannot carry the distinction between two opposite
 * outcomes, and this chip's entire job is to say which of two opposite things
 * happened.
 *
 * The `useToast` tests drive the hook through a real component rather than
 * `renderHook`, because the defects were about what a SURFACE ends up
 * displaying — a hook asserted in isolation would have passed throughout.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { C2CToast, useToast, type ToastTone } from '../toast';

afterEach(cleanup);

describe('C2CToast — a failure may not wear the success tick', () => {
  it('renders nothing at all for an empty message', () => {
    const { container } = render(<C2CToast msg={{ msg: '', tone: 'ok' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('announces an acknowledgement politely, as a status', () => {
    render(<C2CToast msg={{ msg: 'Section saved.', tone: 'ok' }} />);
    const el = screen.getByRole('status');
    expect(el.textContent).toContain('Section saved.');
    // No error tone means no error styling hook.
    expect(el.getAttribute('data-tone')).toBeNull();
  });

  it('announces a failure as an alert, and marks it for the error styling', () => {
    render(<C2CToast msg={{ msg: 'Couldn’t save. Nothing was persisted.', tone: 'error' }} />);
    const el = screen.getByRole('alert');
    expect(el.getAttribute('data-tone')).toBe('error');
    // `role="alert"` implies assertive with nothing to override. The
    // contradictory `role="status" + aria-live="assertive"` pairing that three
    // of the four predecessors used must not come back.
    expect(el.getAttribute('aria-live')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('changes the ICON with the tone, not only the colour', () => {
    const { container: ok } = render(<C2CToast msg={{ msg: 'Saved.', tone: 'ok' }} />);
    const okIcon = ok.querySelector('.ico')?.innerHTML ?? '';
    cleanup();
    const { container: bad } = render(<C2CToast msg={{ msg: 'Failed.', tone: 'error' }} />);
    const badIcon = bad.querySelector('.ico')?.innerHTML ?? '';

    expect(okIcon).not.toBe('');
    expect(badIcon).not.toBe('');
    // SC 1.4.1: the distinction survives for a reader who cannot see the colour.
    expect(badIcon).not.toBe(okIcon);
  });

  /* The four surfaces that had their own pill class kept their position through
     the migration. Three of them (SafetyNarrative, AnaCommand, AnaMemory) sat at
     the TOP because a bottom-centre pill covers the composer on those screens.
     Moving them is a design decision nobody made; being unable to report a
     failure was a bug. Only the second was fixed, and this pins that. */
  it('anchors to the top when asked, without giving up the tone or the role', () => {
    render(<C2CToast msg={{ msg: 'Couldn’t verify — nothing was saved.', tone: 'error' }} position="top" />);
    const el = screen.getByRole('alert');
    expect(el.getAttribute('data-pos')).toBe('top');
    expect(el.getAttribute('data-tone')).toBe('error');
  });

  it('defaults to the house bottom position, marking nothing', () => {
    render(<C2CToast msg={{ msg: 'Filed to the TMF.', tone: 'ok' }} />);
    expect(screen.getByRole('status').getAttribute('data-pos')).toBeNull();
  });

  it('accepts a bare string, and treats it as an acknowledgement', () => {
    render(<C2CToast msg="Copied to clipboard." />);
    expect(screen.getByRole('status').textContent).toContain('Copied to clipboard.');
  });
});

/** A surface, reduced to the one thing under test. */
function Surface({ message, tone }: { message: string; tone?: ToastTone }) {
  const [toast, fire] = useToast();
  return (
    <div>
      <button onClick={() => fire(message, tone)}>fire</button>
      <C2CToast msg={toast} />
    </div>
  );
}

describe('useToast — the tone is part of the type, not an afterthought', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('carries a fired error tone all the way to the rendered element', () => {
    render(<Surface message="Not transmitted. Nothing left the platform." tone="error" />);
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('error');
  });

  it('defaults to an acknowledgement when no tone is given', () => {
    render(<Surface message="Program created." />);
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('holds a failure on screen longer than an acknowledgement', () => {
    const { unmount } = render(<Surface message="Saved." />);
    fireEvent.click(screen.getByText('fire'));
    act(() => { vi.advanceTimersByTime(4300); });
    expect(screen.queryByRole('status')).toBeNull();
    unmount();

    render(<Surface message="Couldn’t save." tone="error" />);
    fireEvent.click(screen.getByText('fire'));
    act(() => { vi.advanceTimersByTime(4300); });
    // Still there — a failure says more and is worth reading twice as long.
    expect(screen.getByRole('alert')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('holds a long acknowledgement as long as a failure — it is a sentence to read', () => {
    render(<Surface message={'Sealed · sha256 · '.padEnd(120, 'x')} />);
    fireEvent.click(screen.getByText('fire'));
    act(() => { vi.advanceTimersByTime(4300); });
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('does not flip an error to the success styling as it dismisses', () => {
    render(<Surface message="Couldn’t save." tone="error" />);
    fireEvent.click(screen.getByText('fire'));
    // One of the copies reset the tone to 'ok' on clear, which repaints the
    // chip green for the frame in which it disappears.
    act(() => { vi.advanceTimersByTime(7999); });
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('error');
  });

  it('replaces a pending dismissal rather than letting it cut the next toast short', () => {
    render(<Surface message="Saved." />);
    fireEvent.click(screen.getByText('fire'));
    act(() => { vi.advanceTimersByTime(4000); });
    fireEvent.click(screen.getByText('fire'));
    // The first toast's timer would have fired at 4200 and blanked this one.
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('clears its timer on unmount rather than setting state on a dead component', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<Surface message="Saved." />);
    fireEvent.click(screen.getByText('fire'));
    unmount();
    act(() => { vi.advanceTimersByTime(9000); });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
