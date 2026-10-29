// @vitest-environment jsdom
/**
 * device-presub and device-udi read the open project (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-features-reach-three/).
 *
 * The map places both inside the project: the Pre-Sub manager is a Plan
 * destination (INFORMATION_ARCHITECTURE.md section 5, slice 12), and the UDI
 * check is where the registration-udi package goes (slice 20). The host refused
 * to mount either without an open project. But PreSubManager read `/api/q-sub`
 * and UdiSurface read `/api/mdx/udi/summary` with no project, so under the
 * project's title they showed every project's Q-Subs and labels, and the host
 * said "Organization-wide view" beside the title.
 *
 * Each now reads the project the host already resolves (`programForContext`).
 * With no project it reads nothing and says so. A project switch never draws
 * the previous project's rows under the new one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Program } from '../data/programs';
import type { SurfaceViewProps } from '../../v2/surfaceViews';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));
const state = vi.hoisted(() => ({ programs: [] as Program[], loading: false, error: null as string | null, refresh: vi.fn() }));
vi.mock('../hooks/useMdxPrograms', () => ({ useMdxPrograms: () => state }));

import { MdxSurfaceHost } from '../MdxSurfaceHost';
import { PreSubManager } from '../presub/PreSubManager';
import { UdiSurface } from '../surfaces/UdiSurface';
import { clearShellProject, publishShellProject } from '../../v2/shellProject';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const NAME: Record<string, string> = { [A]: 'Aurora pump', [B]: 'Borealis monitor' };
const program = (id: string) => ({ id, title: NAME[id], pathway: 'k510', productType: 'device' } as Program);
const props = () => ({ surface: { id: 'device-presub' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps);

const qSub = (projectId: string) => ({
  id: `qs-${projectId.slice(0, 4)}`, qNumber: '—', type: 'presub', prog: projectId.slice(0, 4), progTitle: NAME[projectId],
  title: `${NAME[projectId]} Pre-Sub`, stage: 'plan', daysIn: 1, filed: null, targetDate: null, meeting: null,
  questions: 0, answered: 0, commitments: 0, rolledIn: 0, fdaTeam: 'OHT3', tone: '',
});
const label = (projectId: string) => ({
  id: `lbl-${projectId.slice(0, 4)}`, device: NAME[projectId], kind: 'IFU', region: 'US', lang: 'en', ver: '1',
  size: '—', status: 'draft', updated: '2026-10-01',
});
const udi = (ids: string[]) => ({ data: { devices: [], labels: ids.map(label), symbols: [], issues: [], mri: [] }, meta: { scope: ids.length === 1 ? 'program' : 'organization' } });

let urls: string[] = [];
/** A project whose reads are held until the test releases them. */
let held: { id: string; release: () => void } | null = null;
function bodyFor(url: string): unknown {
  const u = new URL(url, 'http://test');
  const pid = u.searchParams.get('program_id');
  if (u.pathname === '/api/q-sub') return { data: { rows: (pid ? [pid] : [A, B]).map(qSub), count: pid ? 1 : 2 } };
  if (u.pathname.startsWith('/api/q-sub/')) return { data: { id: u.pathname.split('/').pop(), summary: '', questions: [], timeline: [] } };
  if (u.pathname === '/api/mdx/udi/summary') return udi(pid ? [pid] : [A, B]);
  return null;
}
beforeEach(() => {
  urls = [];
  held = null;
  state.programs = [program(A), program(B)]; state.loading = false; state.error = null;
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    if (held && url.includes(held.id)) await new Promise<void>((resolve) => { held!.release = resolve; });
    const body = bodyFor(url);
    return { ok: body !== null, status: body !== null ? 200 : 404, text: async () => '', json: async () => body };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearShellProject(); });

const text = () => document.body.textContent ?? '';

describe('device-presub reads the open project', () => {
  it('asks for the open project\'s Q-Subs only, and shows no other project\'s', async () => {
    publishShellProject({ id: A });
    render(<MdxSurfaceHost {...props()} nav="device-presub" />);
    await waitFor(() => expect(text()).toContain('Aurora pump Pre-Sub'));
    expect(urls).toContain(`/api/q-sub?program_id=${A}`);
    expect(urls).not.toContain('/api/q-sub');
    expect(text()).not.toContain('Borealis monitor Pre-Sub');
  });

  it('is not called an organization-wide view under the project\'s title', async () => {
    publishShellProject({ id: A });
    render(<MdxSurfaceHost {...props()} nav="device-presub" />);
    const context = await screen.findByRole('navigation', { name: 'Project context' });
    expect(context.textContent).toContain('Aurora pump');
    expect(context.textContent).not.toMatch(/organi[sz]ation-wide/i);
  });

  it('never draws the previous project\'s Q-Subs under the next project', async () => {
    publishShellProject({ id: A });
    render(<MdxSurfaceHost {...props()} nav="device-presub" />);
    await waitFor(() => expect(text()).toContain('Aurora pump Pre-Sub'));
    held = { id: B, release: () => {} };
    act(() => publishShellProject({ id: B }));
    await waitFor(() => expect(urls).toContain(`/api/q-sub?program_id=${B}`));
    expect(text()).not.toContain('Aurora pump Pre-Sub');
    await act(async () => { held!.release(); });
    await waitFor(() => expect(text()).toContain('Borealis monitor Pre-Sub'));
  });

  it('with no project, reads nothing and says a project is needed', async () => {
    render(<PreSubManager programId={null} onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('presub-no-project')).toBeTruthy());
    expect(urls.filter((u) => u.startsWith('/api/q-sub'))).toEqual([]);
  });
});

describe('device-udi reads the open project', () => {
  it('asks for the open project\'s UDI summary only, and shows no other project\'s labels', async () => {
    publishShellProject({ id: A });
    render(<MdxSurfaceHost {...props()} nav="device-udi" />);
    await waitFor(() => expect(text()).toContain('Aurora pump — IFU (en)'));
    expect(urls).toContain(`/api/mdx/udi/summary?program_id=${A}`);
    expect(urls).not.toContain('/api/mdx/udi/summary');
    expect(text()).not.toContain('Borealis monitor');
  });

  it('is not called an organization-wide view under the project\'s title', async () => {
    publishShellProject({ id: A });
    render(<MdxSurfaceHost {...props()} nav="device-udi" />);
    const context = await screen.findByRole('navigation', { name: 'Project context' });
    expect(context.textContent).toContain('Aurora pump');
    expect(context.textContent).not.toMatch(/organi[sz]ation-wide/i);
  });

  it('never draws the previous project\'s labels under the next project', async () => {
    publishShellProject({ id: A });
    render(<MdxSurfaceHost {...props()} nav="device-udi" />);
    await waitFor(() => expect(text()).toContain('Aurora pump — IFU (en)'));
    held = { id: B, release: () => {} };
    act(() => publishShellProject({ id: B }));
    await waitFor(() => expect(urls).toContain(`/api/mdx/udi/summary?program_id=${B}`));
    expect(text()).not.toContain('Aurora pump — IFU (en)');
    await act(async () => { held!.release(); });
    await waitFor(() => expect(text()).toContain('Borealis monitor — IFU (en)'));
  });

  it('with no project, reads nothing and says a project is needed', async () => {
    render(<UdiSurface programId={null} onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('udi-no-project')).toBeTruthy());
    expect(urls.filter((u) => u.startsWith('/api/mdx/udi'))).toEqual([]);
  });
});
