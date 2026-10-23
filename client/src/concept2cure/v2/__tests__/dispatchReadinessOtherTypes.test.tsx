// @vitest-environment jsdom
/**
 * DispatchReadiness — a program whose submissions are all of other types is
 * not told it has none (ONE_ANA_ONE_CANVAS.md slice 24, review finding).
 *
 * The gate used to read only the program's submission of its own application
 * type. An IND program whose only submission is an EU MAA therefore had no
 * sequence to gate, and the screen said "No submission for <program> yet …
 * This program has no submission recorded", and told AnA the same, about a
 * program that has one. The first fix named the missing type and the other
 * submissions.
 *
 * F18 (2026-10-22): the screen lists every market of the project, so the MAA
 * is not a footnote to a missing IND: it is a market with its own sequence and
 * its own verdict, gated like any other. "No market" is said only when the
 * project's scoped list is empty.
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
const MAA = { id: 12, title: 'BX-512 EU MAA', productName: 'Vorelinib', applicationType: 'maa', primaryRegion: 'eu', status: 'active', lifecycleStage: 'original', programId: PROGRAM_UUID };
const MAA_VERDICT = {
  sequenceId: 40, region: 'eu', sequenceStatus: 'assembling', validationErrors: 1, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, leafCount: 5,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: { errors: 1, warnings: 0, infos: 0, findings: [] },
  gate: { cleared: false, blockers: ['1 open error-severity validation finding.'] },
};

function serve(subs: unknown[], program = PROGRAM) {
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url === `/api/c2c/projects/${PROGRAM_UUID}`) return ok(program);
    if (url === `/api/submissions?programId=${PROGRAM_UUID}`) return ok(subs);
    if (url === '/api/submissions/12/sequences') return ok([{ id: 40, sequenceNumber: '0000', status: 'assembling' }]);
    if (url === '/api/submissions/sequences/40/dispatch-readiness') return ok(MAA_VERDICT);
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
  it.each(['hde', 'mdl', 'ivd_licence', 'shonin', 'ninsho', 'todokede', 'ivd_approval', 'jp_cdx'])(
    'shows %s as preparation only and gives AnA the same limit', async (programType) => {
      serve([], { ...PROGRAM, program_type: programType });
      const seen: { ctx: SurfaceContext | null } = { ctx: null };
      function Probe() { seen.ctx = useActiveSurfaceContext('dispatch-readiness'); return null; }
      render(<><DispatchReadiness {...props()} /><Probe /></>);
      await waitFor(() => expect(text()).toContain('document preparation only'));
      expect(text()).toContain('does not create submission records or sequences');
      expect(text()).not.toContain('No market for this project yet');
      expect(text()).not.toMatch(/each market['’]s latest sequence/);
      await waitFor(() => expect(seen.ctx?.facts?.listState).toBe('not-sequenced'));
      expect(seen.ctx?.summary).toContain('document preparation only');
      expect(seen.ctx?.facts?.markets).toEqual([]);
      expect(apiRequest.mock.calls.some(c => String(c[1]).endsWith('/dispatch-readiness'))).toBe(false);
    },
  );

  it('gates the MAA as its own market, and never says the program has no submission', async () => {
    serve([MAA]);
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    function Probe() {
      seen.ctx = useActiveSurfaceContext('dispatch-readiness');
      return null;
    }
    render(<><DispatchReadiness {...props()} /><Probe /></>);
    await waitFor(() => expect(text()).toContain('MAA · EU (EMA): Dispatch blocked · 1 blocker'));
    expect(text()).toContain('BX-512 EU MAA');
    expect(text()).not.toMatch(/No IND submission|No submission for BX-512 IND|has no submission recorded|No market/);
    // AnA is told the same: one market, with its verdict.
    await waitFor(() => expect(seen.ctx?.facts?.listState).toBe('listed'));
    expect(seen.ctx?.summary).toContain('MAA · EU (EMA): Dispatch blocked · 1 blocker');
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls).toContain('/api/submissions/sequences/40/dispatch-readiness');
  });

  it('a program with nothing recorded is "no market", and nothing is gated', async () => {
    serve([]);
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toContain('No market for this project yet'));
    expect(text()).toContain('A market is one submission: an application to one agency.');
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls.some((u) => u.endsWith('/dispatch-readiness'))).toBe(false);
  });
});
