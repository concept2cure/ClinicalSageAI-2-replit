// @vitest-environment jsdom
/**
 * AnA's context on device-engineering carries the open project's risk register
 * and design-control trace (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-vault-admits-project/, fix 2).
 *
 * Since fold F1 slice B (79d00b348) Engineering mounts the register
 * (v2/surfaces/RiskRegister.tsx) and the trace (v2/surfaces/DesignControlsTrace.tsx).
 * Each computes what AnA may see of it (`register.anaContext`, `dc.anaContext`),
 * but only Risk.tsx and DesignControls.tsx published it. The host publishes
 * device-engineering's context (mdx/MdxSurfaceHost.tsx), and it said only
 * "the engineering and design-controls workspace", so on Engineering AnA could
 * not see a hazard or a design input the user was looking at.
 *
 * The store holds one context at a time, so the panels' context cannot be a
 * second publish. EngineeringSurface hands it to the host, which merges it into
 * its one device-engineering publish, and only for the project in context.
 * Here:
 *   - the context AnA receives has the register's and the trace's facts;
 *   - on a project switch it never carries the previous project's facts under
 *     the next project;
 *   - after leaving Engineering and coming back, it does not carry the earlier
 *     visit's facts while the register reads again.
 * That the hand-off settles is engineeringAnaContextSettles.test.tsx, rendered
 * outside act() so that a loop fails rather than hangs.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { Program } from '../data/programs';
import type { SurfaceViewProps } from '../../v2/surfaceViews';
import type { SurfaceContext } from '../../v2/surfaceContext';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  /** Every device-engineering context a host render computed for publishing. */
  computed: [] as Array<Omit<SurfaceContext, 'surfaceId'>>,
  /** The project whose panel reads are held until released. */
  held: null as null | { id: string; release: () => void; gate: Promise<void> },
}));

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
const programs = vi.hoisted(() => ({ programs: [] as Program[], loading: false, error: null as string | null, refresh: () => {} }));
vi.mock('../hooks/useMdxPrograms', () => ({ useMdxPrograms: () => programs }));
vi.mock('../../v2/surfaceContext', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../v2/surfaceContext')>();
  return {
    ...real,
    usePublishSurfaceContext: (id: string, ctx: Omit<SurfaceContext, 'surfaceId'> | null) => {
      if (id === 'device-engineering' && ctx) H.computed.push(ctx);
      return real.usePublishSurfaceContext(id, ctx);
    },
  };
});

import { MdxSurfaceHost } from '../MdxSurfaceHost';
import { clearShellProject, publishShellProject } from '../../v2/shellProject';
import { toModuleContext, useActiveSurfaceContext } from '../../v2/surfaceContext';
import { __resetSurfaceActionBus } from '../../v2/surfaceActions';
import { endCompanySession, seedCompanySession } from '../../v2/__tests__/_company-session-fixture';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const program = (id: string, code: string, title: string) =>
  ({ id, code, title, pathway: 'k510', productType: 'device' } as unknown as Program);

const hazard = (n: number) => ({
  id: n, ref_code: `HZ-0${n}`, hazard: `Hazard ${n}`, hazardous_situation: `Situation ${n}`, harm: `Harm ${n}`,
  sequence_of_events: '', severity: 3, probability: 3, detectability: 3, residual_probability: 1,
  control_strategy: 'design_reduce', source: 'fmea', status: 'open', acceptable: null,
});
const input = (id: string, over: Record<string, unknown> = {}) => ({
  id, cat: 'performance', req: `Requirement ${id}`, riskRef: null, outputs: [{ id: `DO-${id}`, desc: 'Output' }],
  ver: 'pass', verRef: 'VER-1', val: 'pass', valRef: 'VAL-1', ...over,
});
/** Project A: six hazards; three inputs, one fully traced. Project B: two hazards, one input. */
const RISKS: Record<string, unknown[]> = {
  [A]: [1, 2, 3, 4, 5, 6].map(n => ({ ...hazard(n), program_id: A })),
  [B]: [1, 2].map(n => ({ ...hazard(n), program_id: B })),
};
const INPUTS: Record<string, unknown[]> = {
  [A]: [input('DI-01'), input('DI-02', { outputs: [], ver: null, val: null }), input('DI-03', { val: 'pending' })],
  [B]: [input('DI-09')],
};
const keyed = (id: string, data: unknown[]) => ({ data, meta: { count: data.length, scope: 'program', programId: id } });
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
const ENGINEERING = {
  data: {
    summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 0, openIssues: 0, riskLastUpdated: null },
    dhf: [], trace: [], risks: [], ecrs: [], issues: [], documents: [],
  },
  meta: { scopes: { risks: 'program', trace: 'program', dhf: 'organization', ecrs: 'organization', issues: 'organization', documents: 'organization' }, unavailable: [] },
};

function hold(id: string) {
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  H.held = { id, release, gate };
}

/** What AnA receives with each turn on device-engineering (V2App: toModuleContext of the active context). */
let wire: Record<string, unknown> | null = null;
function AnaProbe() {
  wire = toModuleContext(useActiveSurfaceContext('device-engineering'));
  return null;
}

const props = (nav: string) => ({ surface: { id: nav }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps);
function Screen({ nav }: { nav: 'device-engineering' | 'device-udi' }) {
  return (
    <>
      <MdxSurfaceHost {...props(nav)} nav={nav} />
      <AnaProbe />
    </>
  );
}

const facts = () => (wire?.facts ?? {}) as Record<string, any>;
const programOf = (c: Omit<SurfaceContext, 'surfaceId'>) => (c.facts?.program as { id?: string } | null)?.id ?? null;
const hazardsIn = (c: Omit<SurfaceContext, 'surfaceId'>) => (c.facts?.riskRegister as { totalHazards?: number } | null | undefined)?.totalHazards;

beforeEach(() => {
  seedCompanySession({ organizationId: '7', displayName: 'E. Editor', firstName: 'E.', lastName: 'Editor' }, 'engineering-context');
  wire = null;
  H.computed.length = 0;
  H.held = null;
  programs.programs = [program(A, 'ENG-A', 'Aurora pump'), program(B, 'ENG-B', 'Borealis monitor')];
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string) => {
    const id = new URL(path, 'http://test').searchParams.get('program_id') ?? '';
    if (H.held && id === H.held.id) await H.held.gate;
    if (method === 'GET' && path.startsWith('/api/mdx/risk-items?')) return answer(200, keyed(id, RISKS[id] ?? []));
    if (method === 'GET' && path.startsWith('/api/design-controls?')) return answer(200, keyed(id, INPUTS[id] ?? []));
    return answer(200, { data: [] });
  });
  vi.stubGlobal('fetch', vi.fn(async () => answer(200, ENGINEERING)));
  (window as unknown as { C2C?: unknown }).C2C = { setContext: vi.fn() };
});
afterEach(() => {
  cleanup();
  endCompanySession();
  vi.unstubAllGlobals();
  clearShellProject();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C?: unknown }).C2C;
});

describe('device-engineering: AnA sees the open project\'s risk register and design-control trace', () => {
  it('carries the register\'s and the trace\'s facts, summaries and actions in the one context', async () => {
    publishShellProject({ id: A });
    render(<Screen nav="device-engineering" />);
    // The panels are on screen: what AnA sees is the question, not whether they drew.
    await waitFor(() => expect(document.querySelector('[data-testid="eng-risk-register"]')?.textContent).toContain('Hazards identified6'));
    expect(document.querySelector('[data-testid="eng-risk-register"]')?.textContent).toContain('HZ-01');
    await waitFor(() => expect(document.querySelector('[data-testid="eng-design-controls"]')?.textContent).toContain('DI-03'));
    await waitFor(() => expect(facts().riskRegister?.totalHazards).toBe(6));
    await waitFor(() => expect(facts().designControlsTrace?.totalInputs).toBe(3));

    expect(wire?.surface).toBe('device-engineering');
    expect(facts().program).toMatchObject({ id: A, title: 'Aurora pump' });
    expect(facts().riskRegister).toMatchObject({ totalHazards: 6, openOrMitigating: 6, accepted: 0, matrixView: 'initial' });
    expect(facts().riskRegister.selected).toMatchObject({ id: 'HZ-01', hazard: 'Hazard 1' });
    expect(facts().designControlsTrace).toMatchObject({ totalInputs: 3, fullyTraced: 1, missingOutput: 1 });
    expect(facts().designControlsTrace.firstGap).toMatchObject({ id: 'DI-02' });

    const summary = String(wire?.summary);
    expect(summary).toContain('Project in context: Aurora pump.');
    expect(summary).toContain('Risk management (ISO 14971): 6 hazard(s)');
    expect(summary).toContain('Design controls (');
    expect(summary).toContain('3 design input(s), 1 fully traced');

    const actions = wire?.available_actions as string[];
    expect(actions).toContain('Switch the matrix between initial and residual risk');
    expect(actions).toContain('Read the traceability matrix — inputs to outputs to verification to validation');
  });

  it('never carries the previous project\'s register or trace under the next project', async () => {
    publishShellProject({ id: A });
    render(<Screen nav="device-engineering" />);
    await waitFor(() => expect(facts().riskRegister?.totalHazards).toBe(6));

    hold(B);
    H.computed.length = 0;
    act(() => publishShellProject({ id: B }));
    await waitFor(() => expect(facts().program?.id).toBe(B));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // Every context computed for B while B's reads were in flight: none is A's.
    const forB = H.computed.filter((c) => programOf(c) === B);
    expect(forB.length).toBeGreaterThan(0);
    expect(forB.filter((c) => hazardsIn(c) === 6)).toEqual([]);
    expect(String(wire?.summary)).toContain('The risk file is still loading');

    await act(async () => { H.held!.release(); });
    await waitFor(() => expect(facts().riskRegister?.totalHazards).toBe(2));
    expect(facts().designControlsTrace?.totalInputs).toBe(1);
  });

  it('after leaving Engineering and coming back, carries nothing from the earlier visit while it reads again', async () => {
    publishShellProject({ id: A });
    const view = render(<Screen nav="device-engineering" />);
    await waitFor(() => expect(facts().riskRegister?.totalHazards).toBe(6));

    view.rerender(<Screen nav="device-udi" />);
    await waitFor(() => expect(wire).toBeNull());

    hold(A);
    H.computed.length = 0;
    view.rerender(<Screen nav="device-engineering" />);
    await waitFor(() => expect(String(wire?.summary)).toContain('The risk file is still loading'));
    expect(H.computed.filter((c) => hazardsIn(c) === 6)).toEqual([]);

    await act(async () => { H.held!.release(); });
    await waitFor(() => expect(facts().riskRegister?.totalHazards).toBe(6));
  });
});
