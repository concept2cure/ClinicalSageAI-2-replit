/**
 * @vitest-environment jsdom
 */
/**
 * useSampleRows / useSampleValue — no fixture may render unasked.
 *
 * Every MDX surface used to resolve its live source as
 * `live.rows ?? FIXTURE`, so canonical example content appeared on
 * exactly the occasions a user could not detect it: an empty tenant, an
 * expired token, a 500. These tests hold the replacement to its one
 * promise — sample content is something the user turns on, never
 * something the product turns on for them.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSampleRows, useSampleValue } from '../useSampleRows';
import { setSampleMode } from '../sampleMode';

const SAMPLE = [{ id: 'example-predicate' }];

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});
/* The toggle notifies subscribed hooks that may still be mounted, so the
   teardown state update has to run inside act. */
afterEach(() => act(() => setSampleMode(false)));

describe('useSampleRows', () => {
  it('returns live rows when the fetch resolved', () => {
    const live = [{ id: 'real' }];
    const { result } = renderHook(() => useSampleRows(live, SAMPLE));
    expect(result.current).toBe(live);
  });

  it('returns empty — not the fixture — when the source is unresolved', () => {
    /* The whole point. An empty tenant, a 401 and a 500 all land here. */
    const { result } = renderHook(() => useSampleRows(null, SAMPLE));
    expect(result.current).toEqual([]);
  });

  it('treats undefined the same as null', () => {
    const { result } = renderHook(() => useSampleRows(undefined, SAMPLE));
    expect(result.current).toEqual([]);
  });

  it('returns a resolved empty list as empty, not as the fixture', () => {
    const live: Array<{ id: string }> = [];
    const { result } = renderHook(() => useSampleRows(live, SAMPLE));
    expect(result.current).toBe(live);
  });

  it('renders the fixture only once sample mode is explicitly enabled', () => {
    act(() => setSampleMode(true));
    const { result } = renderHook(() => useSampleRows(null, SAMPLE));
    expect(result.current).toEqual(SAMPLE);
  });

  it('lets live data win over the fixture even in sample mode', () => {
    act(() => setSampleMode(true));
    const live = [{ id: 'real' }];
    const { result } = renderHook(() => useSampleRows(live, SAMPLE));
    expect(result.current).toBe(live);
  });

  it('enables sample mode from a ?sample=1 link', () => {
    window.history.replaceState({}, '', '/mdx?sample=1');
    const { result } = renderHook(() => useSampleRows(null, SAMPLE));
    expect(result.current).toEqual(SAMPLE);
  });

  it('lets ?sample=0 override a stored preference', () => {
    act(() => setSampleMode(true));
    window.history.replaceState({}, '', '/mdx?sample=0');
    const { result } = renderHook(() => useSampleRows(null, SAMPLE));
    expect(result.current).toEqual([]);
  });

  it('returns a stable empty array so memo dependencies do not churn', () => {
    const { result, rerender } = renderHook(() => useSampleRows(null, SAMPLE));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useSampleValue', () => {
  const CONFIG = { provider: 'Okta' };

  it('returns null rather than a blank shell when there is no value', () => {
    /* A shell of empty identity-provider fields would read as a real,
       misconfigured connection. Absence has to be explicit. */
    const { result } = renderHook(() => useSampleValue(null, CONFIG));
    expect(result.current).toBeNull();
  });

  it('returns the live value when present', () => {
    const live = { provider: 'Entra' };
    const { result } = renderHook(() => useSampleValue(live, CONFIG));
    expect(result.current).toBe(live);
  });

  it('returns the sample only in explicit sample mode', () => {
    act(() => setSampleMode(true));
    const { result } = renderHook(() => useSampleValue(null, CONFIG));
    expect(result.current).toBe(CONFIG);
  });
});
