/**
 * ui-v2 data-connection layer — the `live ?? fixture` contract on the
 * project's ONE fetch convention.
 *
 * The kit's app/data-connect.jsx (window.C2C_API / useLive / SampleTag) is a
 * faithful mirror of client/src/lib/queryClient.ts + utils/authToken.ts; on
 * port it collapses onto them (INSTALL_TARGET_AUDIT §4 — do not introduce a
 * second fetch convention). What this module adds is only the honesty
 * envelope:
 *
 *   liveGet(path, fixture)  → { data, sample, error }  — never throws; the
 *                             fixture comes back with sample:true on any
 *                             failure (network, 401, non-OK).
 *   useLive(path, fixture)  → the same as a hook, with `loading`.
 *   <SampleTag sample/>     → the visible "Sample data" / "Live" pill every
 *                             fixture-backed surface must carry (GAP RULE:
 *                             never present fabricated data as live).
 *   connected()             → a session token exists (mirrors the kit's
 *                             C2C_API.connected()).
 */
import React from 'react';
import { apiRequest } from '@/lib/queryClient';
import { getAuthToken } from '@/utils/authToken';

export interface LiveResult<T> {
  data: T;
  sample: boolean;
  error?: string;
}

export function connected(): boolean {
  return Boolean(getAuthToken());
}

export async function liveGet<T>(path: string, fixture: T): Promise<LiveResult<T>> {
  try {
    const res = await apiRequest('GET', path);
    if (!res.ok) {
      return { data: fixture, sample: true, error: `HTTP ${res.status} ${path}` };
    }
    if (res.status === 204) {
      return { data: fixture, sample: true, error: 'empty response' };
    }
    const data = (await res.json()) as T;
    return { data, sample: false };
  } catch (e) {
    return { data: fixture, sample: true, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface UseLiveState<T> extends LiveResult<T> {
  loading: boolean;
}

/** live ?? fixture with loading + sample flag (kit window.useLive). */
export function useLive<T>(
  path: string | null,
  fixture: T,
  deps: React.DependencyList = [path]
): UseLiveState<T> {
  const [state, setState] = React.useState<UseLiveState<T>>({
    data: fixture,
    loading: Boolean(path),
    sample: true,
  });
  React.useEffect(() => {
    let cancelled = false;
    if (!path) {
      setState({ data: fixture, loading: false, sample: true });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    liveGet<T>(path, fixture).then((res) => {
      if (!cancelled) setState({ ...res, loading: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** The provenance pill every live-backed surface shows (styles in app-v2.css). */
export function SampleTag({ sample }: { sample: boolean }) {
  return (
    <span
      className={`c2c-sample-tag${sample ? '' : ' is-live'}`}
      title={
        sample
          ? 'Backend not reachable — showing sample data from the codebase fixture shape'
          : 'Live data from the concept2cure-v2 backend'
      }
    >
      {sample ? 'Sample data' : 'Live'}
    </span>
  );
}
