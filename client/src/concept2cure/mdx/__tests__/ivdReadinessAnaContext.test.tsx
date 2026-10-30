// @vitest-environment jsdom
/**
 * AnA's context on device-diagnostics carries the open project's IVDR readiness
 * board (D2, fold F2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/).
 *
 * The board (v2/surfaces/IvdReadinessBoard.tsx) was the ivd-completeness
 * screen's, which published what AnA may see of it under its own id. That
 * screen folded into device-diagnostics, whose context the host publishes
 * (mdx/MdxSurfaceHost.tsx). The store holds one context at a time, so the
 * board's cannot be a second publish: IvdSurface hands it to the host
 * (onReadinessContext), which merges it into its one device-diagnostics
 * publish, and only for the project in context, as Engineering's panels do
 * (engineeringAnaContext.test.tsx). Here:
 *   - the context AnA receives carries the board's facts, summary and actions;
 *   - a failed read is told as a failure, never as 0%;
 *   - on a project switch it never carries the previous project's board under
 *     the next project.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Program } from '../data/programs';
import type { SurfaceViewProps } from '../../v2/surfaceViews';
import type { SurfaceContext } from '../../v2/surfaceContext';

const H = vi.hoisted(() => ({
  /** Every device-diagnostics context a host render computed for publishing. */
  computed: [] as Array<Omit<SurfaceContext, 'surfaceId'>>,
  /** The project whose board read is held until released. */
  held: null as null | { id: string; release: () => void; gate: Promise<void> },
  failFor: null as string | null,
}));

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));
const programs = vi.hoisted(() => ({ programs: [] as Program[], loading: false, error: null as string | null, refresh: () => {} }));
vi.mock('../hooks/useMdxPrograms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useMdxPrograms')>()),
  useMdxPrograms: () => programs,
}));
vi.mock('../../v2/surfaceContext', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../v2/surfaceContext')>();
  return {
    ...real,
    usePublishSurfaceContext: (id: string, ctx: Omit<SurfaceContext, 'surfaceId'> | null) => {
      if (id === 'device-diagnostics' && ctx) H.computed.push(ctx);
      return real.usePublishSurfaceContext(id, ctx);
    },
  };
});

import { MdxSurfaceHost } from '../MdxSurfaceHost';
import { clearShellProject, publishShellProject } from '../../v2/shellProject';
import { toModuleContext, useActiveSurfaceContext } from '../../v2/surfaceContext';
import { __resetSurfaceActionBus } from '../../v2/surfaceActions';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const program = (id: string, code: string, title: string) =>
  ({ id, code, title, pathway: 'ivdr', productType: 'ivd', stageIdx: 0, status: 'active', dueLabel: 'No target set' } as unknown as Program);

const family = (id: string, label: string, pct: number) => ({
  id, label, ref: `${label} ref`, blurb: `${label} blurb`, pct,
  items: pct ? [{ code: id, title: `${label} evidence`, ref: `${label} ref`, status: 'complete', pct }] : [],
});
/** The route's display shape for a project; A is 43% complete, B 14%. */
const board = (id: string, overall: number) => ({
  scope: 'program', programId: id, program: id === A ? 'Aurora assay' : 'Borealis assay',
  spine: 'EU IVDR 2017/746', standard: 'IVDR', overall,
  summary: { total: 7, evidenced: 1, inProgress: 0, notStarted: 6, unread: 0, flags: 0 },
  families: ['gspr', 'anal', 'clin', 'valid', 'per', 'desc', 'pmpf'].map((f, i) => family(f, `Family ${f}`, i === 0 ? 100 : 0)),
  unread: [], gsprSourced: true, perDocumentPresent: false,
});
const OVERALL: Record<string, number> = { [A]: 43, [B]: 14 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function hold(id: string) {
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  H.held = { id, release, gate };
}

/** What AnA receives with each turn on device-diagnostics (V2App: toModuleContext of the active context). */
let wire: Record<string, unknown> | null = null;
function AnaProbe() {
  wire = toModuleContext(useActiveSurfaceContext('device-diagnostics'));
  return null;
}
const props = { surface: { id: 'device-diagnostics' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'diagnostics' } as unknown as SurfaceViewProps;
function Screen() {
  const client = React.useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }), []);
  return (
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav="device-diagnostics" />
      <AnaProbe />
    </QueryClientProvider>
  );
}
const facts = () => (wire?.facts ?? {}) as Record<string, any>;
const programOf = (c: Omit<SurfaceContext, 'surfaceId'>) => (c.facts?.program as { id?: string } | null)?.id ?? null;
const overallIn = (c: Omit<SurfaceContext, 'surfaceId'>) => (c.facts?.ivdReadiness as { overallPercent?: number } | null | undefined)?.overallPercent;

beforeEach(() => {
  wire = null;
  H.computed.length = 0;
  H.held = null;
  H.failFor = null;
  programs.programs = [program(A, 'IVD-A', 'Aurora assay'), program(B, 'IVD-B', 'Borealis assay')];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/ivd-completeness/completeness?')) {
      const id = new URL(url, 'http://test').searchParams.get('program_id') ?? '';
      if (H.held && id === H.held.id) await H.held.gate;
      if (H.failFor === id) return json({ error: 'boom' }, 500);
      return json({ success: true, data: board(id, OVERALL[id] ?? 0) });
    }
    if (url.startsWith('/api/ivd-assessments')) return json({ rows: [], count: 0 });
    return json({ data: [] });
  }));
  (window as unknown as { C2C?: unknown }).C2C = { setContext: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearShellProject();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C?: unknown }).C2C;
});

describe("device-diagnostics: AnA sees the open project's IVDR readiness", () => {
  it("carries the board's facts, summary and actions in the one context", async () => {
    publishShellProject({ id: A });
    render(<Screen />);
    await waitFor(() => expect(document.querySelector('[data-testid="ivd-readiness-board"]')).not.toBeNull());
    await waitFor(() => expect(facts().ivdReadiness?.overallPercent).toBe(43));
    expect(wire?.surface).toBe('device-diagnostics');
    expect(facts().program).toMatchObject({ id: A });
    expect(facts().ivdReadiness).toMatchObject({ scope: 'program', programId: A, overallPercent: 43 });
    expect(String(wire?.summary)).toContain('IVDR technical file for Aurora assay');
    expect(wire?.available_actions as string[]).toContain('Expand a requirement family to read its individual IVDR requirements');
  });

  it('a failed read is told as a failure, never as 0%', async () => {
    H.failFor = A;
    publishShellProject({ id: A });
    render(<Screen />);
    await waitFor(() => expect(String(wire?.summary)).toContain('The IVDR completeness read-model was not read'));
    expect(facts().ivdReadiness ?? null).toBeNull();
    expect(String(wire?.summary)).not.toMatch(/\b0% complete/);
  });

  it("never carries the previous project's board under the next project", async () => {
    publishShellProject({ id: A });
    render(<Screen />);
    await waitFor(() => expect(facts().ivdReadiness?.overallPercent).toBe(43));

    hold(B);
    H.computed.length = 0;
    act(() => publishShellProject({ id: B }));
    await waitFor(() => expect(facts().program?.id).toBe(B));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // Every context computed for B while B's read was in flight: none is A's.
    const forB = H.computed.filter((c) => programOf(c) === B);
    expect(forB.length).toBeGreaterThan(0);
    expect(forB.filter((c) => overallIn(c) === 43)).toEqual([]);

    await act(async () => { H.held!.release(); });
    await waitFor(() => expect(facts().ivdReadiness?.overallPercent).toBe(14));
  });
});
