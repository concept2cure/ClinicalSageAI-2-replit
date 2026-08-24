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
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { ReportGovernance } from '../surfaces/ReportGovernance';
import { IdentityConsole } from '../surfaces/IdentityConsole';
import { Orchestration } from '../surfaces/Orchestration';
import { BiopharmaJourney } from '../surfaces/BiopharmaJourney';
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

describe('IdentityConsole — the forbidden state grounds AnA without a single secret', () => {
  beforeEach(() => apiRequest.mockReset());

  it('a 403 publishes "cannot administer" — and no token, CIDR or org id ever enters facts', async () => {
    apiRequest.mockImplementation(async () => fail(403));
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <IdentityConsole
          surface={{ id: 'identity-console', label: 'Identity' } as never}
          onAsk={vi.fn()}
          onNav={vi.fn()}
          segment="biopharma"
        />
        <Probe id="identity-console" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('cannot administer enterprise identity');
      expect(seen.current?.summary).toContain('super_admin or platform_admin');
    });
    const payload = JSON.stringify(seen.current);
    expect(payload).not.toMatch(/cidr|token"|organizationId/i);
  });
});

describe('Orchestration — a dead checkpoint store is NEVER "zero gates pending"', () => {
  beforeEach(() => apiRequest.mockReset());

  it('publishes the gates failure in the reviewer-protecting words', async () => {
    // Every read fails: the program discovery, the checkpoint store, all of
    // it — the branch under test is what the context claims about the gates.
    apiRequest.mockImplementation(async () => fail(500));
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <Orchestration
          surface={{ id: 'orchestration', label: 'Orchestration' } as never}
          onAsk={vi.fn()}
          onNav={vi.fn()}
          segment="biopharma"
        />
        <Probe id="orchestration" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('NOT a report that zero human-in-the-loop gates are pending');
    });
    expect((seen.current?.facts as Record<string, unknown>)?.pendingGateCount ?? null).toBeNull();
  });
});

describe('BiopharmaJourney — the journey publishes real program identity', () => {
  beforeEach(() => apiRequest.mockReset());

  it('a loaded journey names the program, its stage count and readiness', async () => {
    const ROW = {
      code: 'ZX-9', name: 'Zexanib', app: 'BLA', modality: 'small molecule',
      indication: 'relapsed disease', pathway: 'accelerated', sponsor: 'ZenBio',
      agency: 'FDA', readiness: 42, current: 'IND filed',
      target: { label: 'BLA submission', v: 'Q4 2027', agency: 'FDA' },
      seg: 'biotech', overlay: {}, modules: [], clock: [], haqs: [],
      contra: { t: 'none', tag: 'ok', d: 'No contradictions on file.' }, blockers: [],
    };
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/program-journey') return ok({ data: [ROW] });
      return ok({ data: [] });
    });
    const seen = { current: null as SurfaceContext | null };
    render(
      <>
        <BiopharmaJourney
          surface={{ id: 'program-journey', label: 'Journey' } as never}
          onAsk={vi.fn()}
          onNav={vi.fn()}
          segment="biotech"
        />
        <Probe id="program-journey" seen={seen} />
      </>,
    );
    await waitFor(() => {
      expect(seen.current?.summary).toContain('ZX-9');
      expect(seen.current?.summary).toContain('of 9 stages complete');
      expect(seen.current?.summary).toContain('42% ready');
    });
  });
});
