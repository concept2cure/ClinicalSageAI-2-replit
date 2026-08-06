// @vitest-environment jsdom
/**
 * API adapters must survive a payload they did not expect.
 *
 * ── The bug class ─────────────────────────────────────────────────────────────
 * Five adapters in the converged kits were written as:
 *
 *     if (!server) return null;
 *     return { rows: server.rows.map(...) };
 *
 * Null-checked, shape-TRUSTED. `!server` catches null and undefined and nothing
 * else, so any 200 response whose body is not exactly the expected object throws
 * `Cannot read properties of undefined (reading 'map')` — and it throws inside a
 * `useMemo` during render, so React unwinds the whole subtree. `SurfaceBoundary`
 * catches it and shows `SurfaceDegraded`, which means the user gets a "something
 * is broken" panel instead of the honest empty or error state the surface
 * already had written for that case.
 *
 * All five were found the same way and none of them by a test: the visual-QA
 * capture serialized `device-presub` to zero bytes, and later all eight PDEV
 * navs, because the surfaces had crashed rather than rendered.
 *
 * ── Why this file, rather than a lint rule ────────────────────────────────────
 * A static rule for "dereferences a field of a fetched object without checking
 * it" is a false-positive machine. This asserts the property directly, at the
 * only boundary that matters: feed the hook a hostile-but-plausible payload and
 * require that it does not throw.
 *
 * ── What counts as plausible ──────────────────────────────────────────────────
 * Not fuzzing. These are the shapes a real deployment actually produces:
 *   · `{ data: [] }`        — a list endpoint's empty form where an object is expected
 *   · `{ data: {} }`        — a partially-populated record
 *   · `{ data: null }`      — explicit "nothing here"
 *   · `{}`                  — an envelope that lost its payload
 *   · an error body         — a 200 carrying `{ error: … }`, which happens
 * Every one of these is one version skew, one proxy, or one feature flag away.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

import { usePresubList, usePresubDetail } from '../../mdx/hooks/usePresub';
import {
  usePdevProgram,
  usePdevReadiness,
  usePdevIndAssembly,
  usePdevFdaInteractions,
} from '../../pdev/hooks/usePdevData';

/** Shapes a real server, proxy, or version skew can actually produce. */
const HOSTILE_PAYLOADS: ReadonlyArray<[label: string, body: unknown]> = [
  ['a list where an object was expected', { data: [] }],
  ['a partially-populated record', { data: {} }],
  ['an explicit null payload', { data: null }],
  ['an envelope with no payload', {}],
  ['a 200 carrying an error body', { error: 'Something went wrong' }],
  ['a bare array', []],
  ['a JSON scalar', 'unexpected'],
];

let currentBody: unknown = { data: [] };

beforeEach(() => {
  currentBody = { data: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(currentBody), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })),
  );
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/**
 * The hooks under test, each with the argument that makes it fetch. Every one
 * of these had, or sits beside, an adapter that crashed on a bad shape.
 */
const HOOKS: ReadonlyArray<[name: string, run: () => unknown]> = [
  ['usePresubList', () => usePresubList()],
  ['usePresubDetail', () => usePresubDetail('qsub-1')],
  ['usePdevProgram', () => usePdevProgram('prog-1')],
  ['usePdevReadiness', () => usePdevReadiness('prog-1')],
  ['usePdevIndAssembly', () => usePdevIndAssembly('prog-1')],
  ['usePdevFdaInteractions', () => usePdevFdaInteractions('prog-1')],
];

describe('API adapters degrade instead of throwing', () => {
  for (const [hookName, run] of HOOKS) {
    for (const [label, body] of HOSTILE_PAYLOADS) {
      it(`${hookName} survives ${label}`, async () => {
        currentBody = body;

        // renderHook rethrows anything the hook throws during render, so this
        // failing IS the crash — no separate assertion needed for "did not throw".
        const { result } = renderHook(() => run());

        // And it has to still be standing once the response has been adapted,
        // which is where the dereference happens.
        await waitFor(() => {
          expect(
            (result.current as { loading?: boolean })?.loading,
            `${hookName} never finished loading for: ${label}`,
          ).toBe(false);
        });

        // A surface can render null/empty honestly. It cannot render a throw.
        expect(
          result.current,
          `${hookName} returned nothing at all for: ${label}`,
        ).toBeTruthy();
      });
    }
  }

  it('still adapts a WELL-FORMED payload — the guards did not gut the happy path', async () => {
    /*
     * The failure mode of defensive coding is a function that returns empty for
     * everything, passes every hostile case above, and quietly delivers nothing
     * in production. This is the other side of that ratchet.
     */
    currentBody = {
      data: {
        rows: [
          {
            id: 'q1', qNumber: 'Q240001', type: 'presub', prog: 'BX204',
            progTitle: 'BX204', title: 'Pre-Sub for BX204', stage: 'feedback',
            daysIn: 12, filed: '2026-01-04', targetDate: '2026-03-04',
            meeting: 'written', questions: 4, answered: 2, commitments: 1,
            rolledIn: 0, fdaTeam: 'CDRH', tone: 'ok',
          },
        ],
        count: 1,
      },
    };

    const { result } = renderHook(() => usePresubList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.list, 'a valid payload adapted to nothing').toHaveLength(1);
    expect(result.current.list![0].qNumber).toBe('Q240001');
    // The KPI strip is derived from the same list, so an over-defensive adapter
    // would show four zeroed cards rather than an empty state.
    expect(result.current.kpis).toBeTruthy();
    expect(result.current.kpis!.length).toBeGreaterThan(0);
  });
});
