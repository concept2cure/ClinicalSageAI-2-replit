// @vitest-environment jsdom
/**
 * DispatchReadiness — a program whose submissions are all of other types is
 * not told it has none (ONE_ANA_ONE_CANVAS.md slice 24, review finding).
 *
 * The gate reads only the program's submission of its own application type
 * (programSequence.ts submissionBelongsToProgram). An IND program whose only
 * submission is an EU MAA therefore has no sequence to gate, and the screen
 * said "No submission for <program> yet … This program has no submission
 * recorded", and told AnA the same, about a program that has one. The project
 * page now shows that program's submissions beside the readiness verdict, so
 * the claim stood next to its own refutation.
 *
 * The screen and AnA now say which type is missing and name the program's
 * submissions of other types. "No submission" is kept only for a program with
 * none recorded (dispatchReadinessProgramScope.test.tsx pins that wording).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchReadiness } from '../surfaces/DispatchReadiness';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

const PROGRAM_UUID = '2b4c6d8e-0f1a-4b3c-8d5e-7f9a1b3c5d7e';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

const PROGRAM = { id: PROGRAM_UUID, name: 'BX-512 IND', code: 'BX-512', product_name: 'Vorelinib', program_type: 'IND' };
const MAA = { id: 12, title: 'BX-512 EU MAA', productName: 'Vorelinib', applicationType: 'maa', programId: PROGRAM_UUID };

function serve(subs: unknown[]) {
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url === `/api/c2c/projects/${PROGRAM_UUID}`) return ok(PROGRAM);
    if (url === '/api/submissions') return ok(subs);
    return ok([]);
  });
}

const props = () =>
  ({ surface: { id: 'dispatch-readiness', label: 'Dispatch' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'regulatory' });
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('DispatchReadiness — the program’s submissions of other types', () => {
  it('says the IND is missing and names the MAA, never "no submission"', async () => {
    serve([MAA]);
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    function Probe() {
      seen.ctx = useActiveSurfaceContext('dispatch-readiness');
      return null;
    }
    render(<><DispatchReadiness {...props()} /><Probe /></>);
    await waitFor(() => expect(text()).toContain('No IND submission for BX-512 IND yet'));
    expect(text()).toContain('MAA "BX-512 EU MAA"');
    expect(text()).not.toMatch(/No submission for BX-512 IND/);
    expect(text()).not.toMatch(/has no submission recorded/);
    // AnA is told the same, not that the program has nothing.
    await waitFor(() => expect(seen.ctx?.facts?.gateState).toBe('no-submission'));
    expect(seen.ctx?.summary).toContain('has no IND submission recorded');
    expect(seen.ctx?.summary).toContain('MAA "BX-512 EU MAA"');
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls.some((u) => u.endsWith('/dispatch-readiness'))).toBe(false);
  });

  it('a program with nothing recorded is still "no submission", with its type named', async () => {
    serve([]);
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toContain('No submission for BX-512 IND yet'));
    expect(text()).toContain("reads BX-512 IND's IND submission, and none is recorded");
  });
});
