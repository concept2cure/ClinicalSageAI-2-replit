// @vitest-environment jsdom
/**
 * Handing Engineering's panel context up to the host settles (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-vault-admits-project/, fix 2).
 *
 * EngineeringSurface reports its risk register's and design-control trace's
 * AnA context to the host (mdx/surfaces/engineeringPanelsContext.ts), and the
 * host stores it, which re-renders Engineering with the same content. A report
 * on every render, rather than on a change of content, never settles.
 *
 * Why its own file, rendered outside act(). Under act() that loop is
 * synchronous: it never yields, so no timer or test timeout fires and the
 * run hangs instead of failing (mutation F2-M4 in the evidence was killed by
 * `timeout 240`, exit 124). Rendered through createRoot outside act(), each
 * pass is a scheduler task, timers run between them, and a loop is counted and
 * reported as a failure. engineeringAnaContext.test.tsx holds the other cases.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Program } from '../data/programs';
import type { SurfaceViewProps } from '../../v2/surfaceViews';

const H = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
const programs = vi.hoisted(() => ({ programs: [] as Program[], loading: false, error: null as string | null, refresh: () => {} }));
vi.mock('../hooks/useMdxPrograms', () => ({ useMdxPrograms: () => programs }));

import { MdxSurfaceHost } from '../MdxSurfaceHost';
import { clearShellProject, publishShellProject } from '../../v2/shellProject';
import { toModuleContext, useActiveSurfaceContext } from '../../v2/surfaceContext';
import { __resetSurfaceActionBus } from '../../v2/surfaceActions';
import { endCompanySession, seedCompanySession } from '../../v2/__tests__/_company-session-fixture';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hazard = (n: number) => ({
  id: n, program_id: A, ref_code: `HZ-0${n}`, hazard: `Hazard ${n}`, hazardous_situation: `Situation ${n}`, harm: `Harm ${n}`,
  sequence_of_events: '', severity: 3, probability: 3, detectability: 3, residual_probability: 1,
  control_strategy: 'design_reduce', source: 'fmea', status: 'open', acceptable: null,
});
const input = (id: string) => ({
  id, cat: 'performance', req: `Requirement ${id}`, riskRef: null, outputs: [{ id: `DO-${id}`, desc: 'Output' }],
  ver: 'pass', verRef: 'VER-1', val: 'pass', valRef: 'VAL-1',
});
const keyed = (data: unknown[]) => ({ data, meta: { count: data.length, scope: 'program', programId: A } });
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
const ENGINEERING = {
  data: {
    summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 0, openIssues: 0, riskLastUpdated: null },
    dhf: [], trace: [], risks: [], ecrs: [], issues: [], documents: [],
  },
  meta: { scopes: { risks: 'program', trace: 'program', dhf: 'organization', ecrs: 'organization', issues: 'organization', documents: 'organization' }, unavailable: [] },
};

let wire: Record<string, unknown> | null = null;
function AnaProbe() {
  wire = toModuleContext(useActiveSurfaceContext('device-engineering'));
  return null;
}
let commits = 0;
const props = { surface: { id: 'device-engineering' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await pause(20);
  }
  return cond();
}
const traced = () => (wire?.facts as { designControlsTrace?: { totalInputs?: number } } | undefined)?.designControlsTrace?.totalInputs;

let previousActEnv: unknown;
beforeEach(() => {
  seedCompanySession({ organizationId: '7', displayName: 'E. Editor', firstName: 'E.', lastName: 'Editor' }, 'engineering-context');
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown };
  previousActEnv = g.IS_REACT_ACT_ENVIRONMENT;
  g.IS_REACT_ACT_ENVIRONMENT = false;
  wire = null;
  commits = 0;
  programs.programs = [{ id: A, code: 'ENG-A', title: 'Aurora pump', pathway: 'k510', productType: 'device' } as unknown as Program];
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path.startsWith('/api/mdx/risk-items?')) return answer(200, keyed([1, 2, 3].map(hazard)));
    if (method === 'GET' && path.startsWith('/api/design-controls?')) return answer(200, keyed([input('DI-01'), input('DI-02')]));
    return answer(200, { data: [] });
  });
  vi.stubGlobal('fetch', vi.fn(async () => answer(200, ENGINEERING)));
  (window as unknown as { C2C?: unknown }).C2C = { setContext: vi.fn() };
});
afterEach(() => {
  endCompanySession();
  vi.unstubAllGlobals();
  clearShellProject();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C?: unknown }).C2C;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = previousActEnv;
});

describe('device-engineering: the panels\' context hand-off settles', () => {
  it('stops re-rendering the host once the register and the trace have reported', async () => {
    publishShellProject({ id: A });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      root.render(
        <React.Profiler id="host" onRender={() => { commits += 1; }}>
          <MdxSurfaceHost {...props} nav="device-engineering" />
          <AnaProbe />
        </React.Profiler>,
      );
      expect(await until(() => traced() === 2, 4000)).toBe(true);
      await pause(150);
      const settled = commits;
      await pause(400);
      expect(commits - settled).toBe(0);
      expect(settled).toBeLessThan(60);
    } finally {
      root.unmount();
      container.remove();
    }
  });
});
