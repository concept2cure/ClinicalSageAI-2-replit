// @vitest-environment jsdom
/**
 * A tab opened before a release must be able to get into the app after it.
 *
 * The sign-in page never loads the V2App chunk; it is first imported after the
 * second factor. On a tab that outlived a release, Vite's preload rejects with
 * "Unable to preload CSS for /assets/V2App-<old>.css" and the error reaches the
 * root ErrorBoundary. Its "Try Again" reset state and re-rendered — but
 * React.lazy caches a rejected import and rethrows it on every render, so the
 * button could never recover, and SurfaceBoundary classified the same message
 * as a fault on our side. Only a page load fetches the new index.html.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/utils/sentry', () => ({ Sentry: { captureException: vi.fn() } }));

import { ErrorBoundary } from '../ErrorBoundary';
import { isChunkLoadFailure } from '../concept2cure/v2/SurfaceScaffold';

function Stale({ message }: { message: string }): React.ReactElement {
  throw new Error(message);
}

const reload = vi.fn();
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  reload.mockReset();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  consoleError.mockRestore();
});

describe('a chunk from the previous release', () => {
  it("is classified as a load failure, not a fault of ours (Vite's CSS preload message)", () => {
    expect(isChunkLoadFailure('Unable to preload CSS for /assets/V2App-3f9a1c.css')).toBe(true);
  });

  it('"Try Again" on the root boundary loads the page again', () => {
    render(
      <ErrorBoundary>
        <Stale message="Unable to preload CSS for /assets/V2App-3f9a1c.css" />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a render crash still resets in place (no reload for our own defects)', () => {
    render(
      <ErrorBoundary>
        <Stale message="Cannot read properties of null (reading 'map')" />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reload).not.toHaveBeenCalled();
  });
});
