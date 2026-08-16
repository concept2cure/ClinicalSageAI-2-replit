// @vitest-environment jsdom
/**
 * The toast — the one transient channel a write has to report what happened.
 *
 * ── What these tests hold ────────────────────────────────────────────────────
 * Twenty-six surfaces each defined their own toast, and twenty-four of those
 * copies could not render a failure AS a failure: they hardcoded
 * `I.checkCircle`, and `.de-toast .ico` is unconditionally `var(--success)`.
 * So "Couldn't save — nothing was persisted" arrived under a green tick.
 *
 * The property is therefore not "a shared file exists". It is:
 *
 *   1. an error toast is visually distinguishable from a success toast by
 *      something other than its wording — the `data-tone` hook the stylesheet
 *      colours, AND a different icon, because colour alone does not carry the
 *      distinction for a colour-blind reviewer (WCAG 2.2 SC 1.4.1);
 *   2. an error interrupts a screen reader and a confirmation does not
 *      (SC 4.1.3), via `role="alert"` rather than the self-contradictory
 *      `role="status"` + `aria-live="assertive"` the old cmcShared copy used;
 *   3. the tone is a PARAMETER, so a caller cannot accidentally inherit
 *      "success" — the failure mode that produced the defect.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { C2CToast, useToast, type ToastTone } from '../toast';

afterEach(cleanup);

/** Drives the hook the way a surface does. */
function Harness({ msg, tone }: { msg: string; tone?: ToastTone }) {
  const [toast, fire] = useToast();
  return (
    <div>
      <button onClick={() => fire(msg, tone)}>fire</button>
      <C2CToast msg={toast} />
    </div>
  );
}

describe('C2CToast — a failure is not announced in the vocabulary of success', () => {
  it('marks an error with data-tone="error", which is the hook the stylesheet colours', () => {
    render(<C2CToast msg={{ msg: 'Couldn’t save. Nothing was persisted.', tone: 'error' }} />);
    expect(document.querySelector('.de-toast')!.getAttribute('data-tone')).toBe('error');
  });

  it('does not mark a confirmation as an error', () => {
    render(<C2CToast msg={{ msg: 'Saved.', tone: 'ok' }} />);
    expect(document.querySelector('.de-toast')!.getAttribute('data-tone')).toBe('ok');
  });

  /* The regression that motivated the whole migration. `.de-toast .ico` is
     `var(--success)` unconditionally, so an unchanged icon means a red pill
     with a green tick in it — and for a reader who cannot use the colour, no
     signal at all. */
  it('changes the ICON with the tone, not only the colour (SC 1.4.1)', () => {
    const { container: err } = render(
      <C2CToast msg={{ msg: 'Export failed — HTTP 500.', tone: 'error' }} />,
    );
    const errIcon = err.querySelector('.de-toast .ico')!.innerHTML;
    cleanup();
    const { container: ok } = render(<C2CToast msg={{ msg: 'Published DOCX', tone: 'ok' }} />);
    const okIcon = ok.querySelector('.de-toast .ico')!.innerHTML;

    expect(errIcon).not.toBe(okIcon);
  });

  it('renders nothing at all when there is no message', () => {
    const { container } = render(<C2CToast msg={{ msg: '', tone: 'error' }} />);
    expect(container.querySelector('.de-toast')).toBeNull();
  });
});

describe('C2CToast — announcement', () => {
  /* role="alert" implies assertive AND aria-atomic with nothing to override.
     The copy this replaced paired role="status" (implicitly POLITE) with an
     explicit aria-live="assertive"; assistive tech has historically diverged on
     which wins, so a failed governed action could queue behind other chatter. */
  it('announces an error as an alert, with no contradictory aria-live override', () => {
    render(<C2CToast msg={{ msg: 'Signature rejected — the PIN was not verified.', tone: 'error' }} />);
    const el = screen.getByRole('alert');
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-live')).toBeNull();
  });

  it('announces a confirmation politely, as a status', () => {
    render(<C2CToast msg={{ msg: 'Plan activated.', tone: 'ok' }} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('useToast — tone is a parameter, and defaults do not lie', () => {
  it('defaults to ok when a caller passes no tone', () => {
    render(<Harness msg="Saved." />);
    act(() => screen.getByText('fire').click());
    expect(document.querySelector('.de-toast')!.getAttribute('data-tone')).toBe('ok');
  });

  it('carries an explicit error tone through to the rendered toast', () => {
    render(<Harness msg="Couldn’t seal the report." tone="error" />);
    act(() => screen.getByText('fire').click());
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('error');
  });

  it('holds a failure on screen longer than a confirmation', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<Harness msg="Saved." />);
      act(() => screen.getByText('fire').click());
      act(() => void vi.advanceTimersByTime(3300));
      expect(document.querySelector('.de-toast')).toBeNull();

      rerender(<Harness msg="Couldn’t save." tone="error" />);
      act(() => screen.getByText('fire').click());
      act(() => void vi.advanceTimersByTime(3300));
      expect(document.querySelector('.de-toast')).not.toBeNull();
      act(() => void vi.advanceTimersByTime(4000));
      expect(document.querySelector('.de-toast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /* The DocumentAuthoring copy had no cleanup, so a surface unmounted inside
     the dismiss window set state on a dead component. */
  it('clears its pending timer on unmount', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { unmount } = render(<Harness msg="Saved." />);
      act(() => screen.getByText('fire').click());
      unmount();
      act(() => void vi.advanceTimersByTime(10_000));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});
