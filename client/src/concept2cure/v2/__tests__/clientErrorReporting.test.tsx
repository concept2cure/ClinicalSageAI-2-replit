// @vitest-environment jsdom
/**
 * A customer-visible crash must leave the browser.
 *
 * `Sentry.captureException` was called ZERO times in the client. `SurfaceBoundary`
 * — the boundary wrapping every ui-v2 surface, and therefore the one an
 * authenticated user actually reaches — had no `componentDidCatch` at all: React
 * caught the error, replaced the subtree, and dropped the error object. The
 * fallback then told the user "a module script dropped on the way in — usually a
 * transient network hiccup", attributing a code defect to their connection.
 *
 * These tests pin the fix from both ends:
 *   • the boundary REPORTS through the app's monitoring client, with the
 *     component stack and the surface identity attached;
 *   • the fallback COPY tells the truth about which of the two failures happened
 *     — a render crash is named as a fault on our side, a genuinely failed chunk
 *     fetch keeps the network wording;
 *   • reporting is best-effort: a monitoring client that throws must not escalate
 *     a contained surface crash into a whole-app crash.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const captureException = vi.hoisted(() => vi.fn());
vi.mock('@/utils/sentry', () => ({ Sentry: { captureException } }));

import { SurfaceBoundary, SurfaceDegraded, isChunkLoadFailure } from '../SurfaceScaffold';

/** Throws on render, the way a surface reading an unexpected payload does. */
function Exploding({ message }: { message: string }): React.ReactElement {
  throw new Error(message);
}

// React logs caught boundary errors to console.error; silence it so the suite
// output stays readable without suppressing our own assertions.
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  captureException.mockReset();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  cleanup();
});

describe('SurfaceBoundary reports the crashes it catches', () => {
  it('captures a render crash, with the component stack and the surface identity', () => {
    render(
      <SurfaceBoundary resetKey="pharmacovigilance">
        <Exploding message="Cannot read properties of undefined (reading 'toLowerCase')" />
      </SurfaceBoundary>,
    );

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, opts] = captureException.mock.calls[0] as [Error, Record<string, any>];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('toLowerCase');

    // Which boundary, which surface, and what class of failure — without these a
    // report is "a surface crashed somewhere", which is barely better than none.
    expect(opts.tags.boundary).toBe('SurfaceBoundary');
    expect(opts.extra.resetKey).toBe('pharmacovigilance');
    expect(opts.extra.kind).toBe('render-crash');
    expect(opts.contexts.react.componentStack).toContain('Exploding');
  });

  it('classifies a failed chunk fetch separately from a code defect', () => {
    render(
      <SurfaceBoundary resetKey="vault">
        <Exploding message="Failed to fetch dynamically imported module: /assets/Vault-abc123.js" />
      </SurfaceBoundary>,
    );

    const [, opts] = captureException.mock.calls[0] as [Error, Record<string, any>];
    // Still reported — a stale deploy is a real production symptom nobody could
    // see either — but not filed alongside our own bugs.
    expect(opts.extra.kind).toBe('chunk-load');
  });

  it('does not escalate a contained crash when the monitoring client throws', () => {
    captureException.mockImplementation(() => {
      throw new Error('transport is down');
    });

    // The boundary must still swallow the original error and render its
    // fallback. If reportClientError rethrew, this render would throw out of
    // the test — which is exactly what it would do to the user's whole app.
    expect(() =>
      render(
        <SurfaceBoundary resetKey="tasks">
          <Exploding message="boom" />
        </SurfaceBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });
});

describe('the degraded state describes the failure it actually had', () => {
  it('a render crash is named as a fault on our side, not a network hiccup', () => {
    render(
      <SurfaceBoundary resetKey="risk">
        <Exploding message="rows.map is not a function" />
      </SurfaceBoundary>,
    );

    expect(screen.getByText('This surface stopped unexpectedly')).toBeTruthy();
    expect(document.body.textContent).toContain('a fault on our side');
    // The old copy blamed the user's connection for our defect.
    expect(document.body.textContent).not.toContain('transient network hiccup');
  });

  it('a failed chunk fetch keeps the network wording, because that is true', () => {
    render(
      <SurfaceBoundary resetKey="vault">
        <Exploding message="error loading dynamically imported module" />
      </SurfaceBoundary>,
    );

    expect(screen.getByText('This surface didn’t finish loading')).toBeTruthy();
    expect(document.body.textContent).toContain('transient network hiccup');
  });

  it('defaults to the load wording when rendered directly with no kind', () => {
    render(<SurfaceDegraded />);
    expect(screen.getByText('This surface didn’t finish loading')).toBeTruthy();
  });
});

describe('chunk-load classification is conservative', () => {
  it('recognizes the messages the bundlers and browsers actually produce', () => {
    for (const m of [
      'Failed to fetch dynamically imported module: /assets/x.js',
      'error loading dynamically imported module',
      'Loading chunk 42 failed.',
      'importing a module script failed.',
    ]) {
      expect(isChunkLoadFailure(m), m).toBe(true);
    }
  });

  it('treats an unrecognized message as a crash, never as a network event', () => {
    // The failure mode being avoided: a new error string quietly inheriting the
    // "network hiccup" copy and never being read as a defect.
    for (const m of [
      "Cannot read properties of null (reading 'map')",
      'Maximum update depth exceeded',
      '',
    ]) {
      expect(isChunkLoadFailure(m), m).toBe(false);
    }
  });
});
