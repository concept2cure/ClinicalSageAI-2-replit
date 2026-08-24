// @vitest-environment jsdom
/**
 * AnA sees the wave-5 screens — publisher wiring proof through the REAL
 * delivery path (useActiveSurfaceContext, the same hook V2App folds into
 * module_context). Each case renders the real surface plus a probe and pins
 * the honest branch that matters most: a ready summary with real counts, and
 * the failure branch published as a failure — never as an empty screen.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ReportGovernance } from '../surfaces/ReportGovernance';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({ error: 'nope' }) } as Response;
}

/** Reads the published context exactly the way the shell does. */
function Probe({ id, seen }: { id: string; seen: { current: SurfaceContext | null } }) {
  const ctx = useActiveSurfaceContext(id);
  React.useEffect(() => {
    seen.current = ctx;
  });
  return null;
}

afterEach(cleanup);

describe('ReportGovernance — the register publishes itself honestly', () => {
  beforeEach(() => apiRequest.mockReset());

  const props = () =>
    ({ surface: { id: 'report-governance', label: 'Report governance' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

  it('a loaded register publishes real seal counts', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/intelligent-reports/list/0')
        return ok({
          data: [
            { id: 1, reportCode: 'IR-001', title: 'Q2 safety report', domain: 'safety', sealStatus: 'sealed' },
            { id: 2, reportCode: 'IR-002', title: 'CMC summary', domain: 'cmc', sealStatus: null },
          ],
        });
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <ReportGovernance {...props()} />
        <Probe id="report-governance" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('2 governed report(s) — 1 sealed, 0 revoked, 1 draft');
    });
    expect(seen.current?.facts).toMatchObject({ reportCount: 2, sealed: 1, draft: 1 });
  });

  it('a FAILED register read publishes the failure, never an empty org', async () => {
    apiRequest.mockImplementation(async () => fail(500));
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <ReportGovernance {...props()} />
        <Probe id="report-governance" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('could not be read');
      expect(seen.current?.summary).toContain('not an organization with no governed reports');
    });
  });
});
